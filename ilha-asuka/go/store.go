// Package core is the retained scene-graph store behind the
// ilha-asuka experiment: ilha's renderer paints into it from Bun, and it
// speaks Asuka's core-to-host protocol.
//
// Every mutation is recorded into an ops.Batch from
// github.com/egoist/asuka, so the log replays onto any real Asuka host
// (host/fake in tests, native hosts later): Create, SetProp, Insert with
// an index, Remove, Destroy, Listen, SetRoot and SetFrame. Layout runs on
// Asuka's own flexbox/grid engine (github.com/egoist/asuka/layout), which
// turns the style strings ilha sends into frames the same way Asuka's
// core does for its hosts.
//
// String props that are not Asuka schema props fall into two core-side
// buckets that never enter the batch, mirroring how Asuka's ui.Style
// stays in the core: Style (layout inputs like direction, gap, padding)
// and Attrs (a lab escape hatch for test ids and foreign attributes).
package core

import (
	"encoding/json"
	"strconv"
	"strings"
	"sync"

	"github.com/egoist/asuka/layout"
	"github.com/egoist/asuka/ops"
)

// Version is the store schema version served over every transport.
// 1 was the stringly mygo store; 2 is the Asuka op protocol.
const Version = 2

// Style keys ilha sends that feed the layout engine instead of the host.
// They live in the core like Asuka's ui.Style and never enter the batch.
var styleKeys = map[string]bool{
	"direction": true,
	"wrap":      true,
	"gap":       true,
	"padding":   true,
	"width":     true,
	"height":    true,
	"align":     true,
	"justify":   true,
	"grow":      true,
	"shrink":    true,
}

// Schema ID aliases, so transports speak Asuka's numeric IDs directly.
type (
	Kind   = ops.Kind
	PropID = ops.PropID
	Event  = ops.EventKind
)

// Node is one retained host node: an Asuka kind, typed schema props, an
// ordered child-handle list, host-side event subscriptions, a frame from
// the last layout pass, and core-side style inputs plus lab attributes.
type Node struct {
	ID       int64
	Kind     ops.Kind
	Props    map[ops.PropID]ops.Value
	Attrs    map[string]string
	Style    map[string]string
	Children []int64
	Listens  map[ops.EventKind]bool
	Frame    [4]float32
	box      *layout.Node
}

// nodeJSON is the recursive expansion served by Describe.
type nodeJSON struct {
	ID       int64          `json:"id"`
	Kind     string         `json:"kind"`
	KindID   int            `json:"kindId"`
	Props    map[string]any `json:"props"`
	Children []*nodeJSON    `json:"children"`
	Frame    [4]float32     `json:"frame"`
	Listens  []string       `json:"listens"`
}

// Store is a concurrency-safe retained node set. Handles start at 1;
// 0 is never a valid node.
type Store struct {
	mu    sync.Mutex
	next  int64
	nodes map[int64]*Node
	root  int64
	log   ops.Batch
	pass  layout.Pass
}

// NewStore returns an empty store.
func NewStore() *Store {
	return &Store{next: 1, nodes: make(map[int64]*Node)}
}

// Default is the process-wide store shared by the FFI and IPC transports.
var Default = NewStore()

// propIDOf resolves a schema prop name for a kind using Asuka's own
// schema tables: per-kind props first, then the common props.
func propIDOf(kind ops.Kind, name string) (ops.PropID, bool) {
	if m, ok := kindProps[kind]; ok {
		if id, ok := m[name]; ok {
			return id, true
		}
	}
	id, ok := commonProps[name]
	return id, ok
}

var (
	commonProps = map[string]ops.PropID{}
	kindProps   = map[ops.Kind]map[string]ops.PropID{}
)

func init() {
	for i, d := range ops.Schema.Common {
		commonProps[d.Name] = ops.PropID(i + 1)
	}
	for ki, kd := range ops.Schema.Kinds {
		m := make(map[string]ops.PropID, len(kd.Props))
		for pi, pd := range kd.Props {
			m[pd.Name] = ops.PropID(ops.FirstKindProp + pi)
		}
		kindProps[ops.Kind(ki+1)] = m
	}
}

// validKind reports whether k is an Asuka view kind a host could create.
func validKind(k ops.Kind) bool {
	s := k.String()
	return !strings.HasPrefix(s, "Kind(")
}

// validEvent reports whether e is an Asuka event a host could send.
func validEvent(e ops.EventKind) bool {
	s := e.String()
	return !strings.HasPrefix(s, "Event(")
}

// Reset drops every node and restarts handle allocation at 1.
func (s *Store) Reset() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.next = 1
	s.nodes = make(map[int64]*Node)
	s.root = 0
	s.log.Reset()
	s.pass.Changed = s.pass.Changed[:0]
}

// Create adds a node of the given Asuka kind and returns its handle.
// Unknown kinds return 0, which is never a valid node.
func (s *Store) Create(kind ops.Kind) int64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !validKind(kind) {
		return 0
	}
	id := s.next
	s.next++
	box := layout.New()
	box.Context = id
	s.nodes[id] = &Node{
		ID:      id,
		Kind:    kind,
		Props:   make(map[ops.PropID]ops.Value),
		Attrs:   make(map[string]string),
		Style:   make(map[string]string),
		Listens: make(map[ops.EventKind]bool),
		box:     box,
	}
	s.log.Create(ops.NodeID(id), kind)
	return id
}

// set records a typed schema prop after validating the node, the prop
// and the wire type against Asuka's schema — the same check a real
// host applies, so a false here means the op could never be hosted.
func (s *Store) set(id int64, prop ops.PropID, value ops.Value) bool {
	n, ok := s.nodes[id]
	if !ok {
		return false
	}
	want, ok := ops.PropType(n.Kind, prop)
	if !ok || want != value.Type {
		return false
	}
	n.Props[prop] = value
	switch value.Type {
	case ops.TBool:
		s.log.SetBool(ops.NodeID(id), prop, value.Int != 0)
	case ops.TInt:
		s.log.SetInt(ops.NodeID(id), prop, value.Int)
	case ops.TFloat:
		s.log.SetFloat(ops.NodeID(id), prop, value.Float)
	case ops.TString:
		s.log.SetString(ops.NodeID(id), prop, value.Str)
	case ops.TEnum:
		s.log.SetEnum(ops.NodeID(id), prop, int32(value.Int))
	default:
		return false
	}
	n.box.MarkDirty()
	return true
}

// SetString records a string schema prop.
func (s *Store) SetString(id int64, prop ops.PropID, value string) bool {
	return s.set(id, prop, ops.Value{Type: ops.TString, Str: value})
}

// SetInt records an integer schema prop.
func (s *Store) SetInt(id int64, prop ops.PropID, value int64) bool {
	return s.set(id, prop, ops.Value{Type: ops.TInt, Int: value})
}

// SetFloat records a float schema prop.
func (s *Store) SetFloat(id int64, prop ops.PropID, value float64) bool {
	return s.set(id, prop, ops.Value{Type: ops.TFloat, Float: value})
}

// SetBool records a boolean schema prop.
func (s *Store) SetBool(id int64, prop ops.PropID, value bool) bool {
	var v int64
	if value {
		v = 1
	}
	return s.set(id, prop, ops.Value{Type: ops.TBool, Int: v})
}

// SetEnum records an enum schema prop by its value index.
func (s *Store) SetEnum(id int64, prop ops.PropID, value int32) bool {
	return s.set(id, prop, ops.Value{Type: ops.TEnum, Int: int64(value)})
}

// SetProp records a schema prop by name, for transports that only carry
// strings. Unknown names fall through to style inputs and lab
// attributes; type mismatches report false.
func (s *Store) SetProp(id int64, key, value string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	n, ok := s.nodes[id]
	if !ok {
		return false
	}
	if prop, ok := propIDOf(n.Kind, key); ok {
		want, ok := ops.PropType(n.Kind, prop)
		if !ok {
			return false
		}
		switch want {
		case ops.TString:
			return s.set(id, prop, ops.Value{Type: ops.TString, Str: value})
		case ops.TBool:
			b, err := strconv.ParseBool(value)
			if err != nil {
				return false
			}
			var v int64
			if b {
				v = 1
			}
			return s.set(id, prop, ops.Value{Type: ops.TBool, Int: v})
		case ops.TInt:
			v, err := strconv.ParseInt(value, 10, 64)
			if err != nil {
				return false
			}
			return s.set(id, prop, ops.Value{Type: ops.TInt, Int: v})
		case ops.TFloat:
			v, err := strconv.ParseFloat(value, 64)
			if err != nil {
				return false
			}
			return s.set(id, prop, ops.Value{Type: ops.TFloat, Float: v})
		default:
			return false
		}
	}
	if styleKeys[key] {
		n.Style[key] = value
		n.box.MarkDirty()
		return true
	}
	n.Attrs[key] = value
	return true
}

// SetStyle records a layout input (direction, gap, padding, …).
// Style stays core-side like Asuka's ui.Style and never enters the batch.
func (s *Store) SetStyle(id int64, key, value string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	n, ok := s.nodes[id]
	if !ok {
		return false
	}
	n.Style[key] = value
	n.box.MarkDirty()
	return true
}

// SetAttr records a lab-only attribute (test ids, foreign attributes).
// Attributes describe with the node but never enter the batch.
func (s *Store) SetAttr(id int64, key, value string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	n, ok := s.nodes[id]
	if !ok {
		return false
	}
	n.Attrs[key] = value
	return true
}

// DelProp deletes a schema prop, style input or attribute by name.
func (s *Store) DelProp(id int64, key string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	n, ok := s.nodes[id]
	if !ok {
		return false
	}
	if prop, ok := propIDOf(n.Kind, key); ok {
		if _, ok := n.Props[prop]; !ok {
			return true
		}
		delete(n.Props, prop)
		n.box.MarkDirty()
		return true
	}
	if styleKeys[key] {
		delete(n.Style, key)
		n.box.MarkDirty()
		return true
	}
	delete(n.Attrs, key)
	return true
}

// parentOf finds the node parenting id, if any.
func (s *Store) parentOf(id int64) *Node {
	for _, n := range s.nodes {
		for _, child := range n.Children {
			if child == id {
				return n
			}
		}
	}
	return nil
}

// descendantOf reports whether id sits under (or is) ancestor.
func (s *Store) descendantOf(id, ancestor int64) bool {
	if id == ancestor {
		return true
	}
	n, ok := s.nodes[ancestor]
	if !ok {
		return false
	}
	for _, child := range n.Children {
		if s.descendantOf(id, child) {
			return true
		}
	}
	return false
}

// Insert attaches child to parent at index, Asuka semantics: the index
// is clamped into range, but a child that already has a parent is
// refused — move it with Remove first, exactly as a real host requires.
func (s *Store) Insert(parent, child int64, index int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.nodes[parent]
	if !ok {
		return false
	}
	if _, ok := s.nodes[child]; !ok {
		return false
	}
	if s.parentOf(child) != nil {
		return false
	}
	if s.descendantOf(parent, child) {
		return false
	}
	if p.Kind == ops.KindScroll && len(p.Children) > 0 {
		return false
	}
	if index < 0 {
		index = 0
	}
	if index > len(p.Children) {
		index = len(p.Children)
	}
	p.Children = append(p.Children, 0)
	copy(p.Children[index+1:], p.Children[index:])
	p.Children[index] = child
	s.log.Insert(ops.NodeID(parent), ops.NodeID(child), index)
	return true
}

// Remove detaches child from parent. Unknown handles — or a child that
// is not parent's — report false.
func (s *Store) Remove(parent, child int64) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.nodes[parent]
	if !ok {
		return false
	}
	if _, ok := s.nodes[child]; !ok {
		return false
	}
	kept := p.Children[:0]
	found := false
	for _, existing := range p.Children {
		if existing == child {
			found = true
			continue
		}
		kept = append(kept, existing)
	}
	if !found {
		return false
	}
	p.Children = kept
	s.log.Remove(ops.NodeID(parent), ops.NodeID(child))
	return true
}

// Destroy detaches the node from its parent and deletes its whole
// subtree. Every removed node is logged, children first, so the batch
// replays onto a real host that (like host/fake) does not cascade.
func (s *Store) Destroy(id int64) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.nodes[id]; !ok {
		return false
	}
	if p := s.parentOf(id); p != nil {
		kept := p.Children[:0]
		for _, child := range p.Children {
			if child != id {
				kept = append(kept, child)
			}
		}
		p.Children = kept
		s.log.Remove(ops.NodeID(p.ID), ops.NodeID(id))
	}
	var drop func(nodeID int64)
	drop = func(nodeID int64) {
		n, ok := s.nodes[nodeID]
		if !ok {
			return
		}
		children := append([]int64(nil), n.Children...)
		for _, child := range children {
			drop(child)
		}
		if nodeID == s.root {
			s.root = 0
		}
		delete(s.nodes, nodeID)
		s.log.Destroy(ops.NodeID(nodeID))
	}
	drop(id)
	return true
}

// Listen subscribes the node to a host event kind.
func (s *Store) Listen(id int64, event ops.EventKind) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	n, ok := s.nodes[id]
	if !ok || !validEvent(event) {
		return false
	}
	n.Listens[event] = true
	s.log.Listen(ops.NodeID(id), event)
	return true
}

// Unlisten drops a host event subscription.
func (s *Store) Unlisten(id int64, event ops.EventKind) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	n, ok := s.nodes[id]
	if !ok || !validEvent(event) {
		return false
	}
	delete(n.Listens, event)
	s.log.Unlisten(ops.NodeID(id), event)
	return true
}

// SetRoot marks the mounted root view whose frames a host places.
func (s *Store) SetRoot(id int64) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.nodes[id]; !ok {
		return false
	}
	s.root = id
	s.log.SetRoot(ops.NodeID(id))
	return true
}

// Count returns the number of live nodes.
func (s *Store) Count() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.nodes)
}

// Ops returns the recorded op log as one string per op, in order.
func (s *Store) Ops() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]string, 0, len(s.log.Ops))
	for i := range s.log.Ops {
		out = append(out, s.log.Ops[i].String())
	}
	return out
}

// propValue renders a schema prop value for Describe.
func propValue(v ops.Value) any {
	switch v.Type {
	case ops.TBool:
		return v.Int != 0
	case ops.TInt, ops.TEnum:
		return v.Int
	case ops.TFloat:
		return v.Float
	case ops.TString:
		return v.Str
	default:
		return v.String()
	}
}

func (s *Store) expand(id int64) *nodeJSON {
	n, ok := s.nodes[id]
	if !ok {
		return nil
	}
	props := make(map[string]any, len(n.Props)+len(n.Attrs)+len(n.Style))
	for prop, v := range n.Props {
		props[ops.KindPropName(n.Kind, prop)] = propValue(v)
	}
	for k, v := range n.Style {
		props[k] = v
	}
	for k, v := range n.Attrs {
		props[k] = v
	}
	out := &nodeJSON{
		ID:       n.ID,
		Kind:     n.Kind.String(),
		KindID:   int(n.Kind),
		Props:    props,
		Children: []*nodeJSON{},
		Frame:    n.Frame,
		Listens:  []string{},
	}
	for e := range n.Listens {
		out.Listens = append(out.Listens, e.String())
	}
	for _, child := range n.Children {
		if expanded := s.expand(child); expanded != nil {
			out.Children = append(out.Children, expanded)
		}
	}
	return out
}

// Describe renders the node's subtree as JSON: Asuka kind names and
// IDs, schema props by name, core-side style and attributes, children,
// the last layout frame and host event subscriptions.
func (s *Store) Describe(id int64) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	expanded := s.expand(id)
	if expanded == nil {
		return "", false
	}
	raw, err := json.Marshal(expanded)
	if err != nil {
		return "", false
	}
	return string(raw), true
}

// Len parses a layout length: points ("16"), percent ("50%") or auto.
func parseLen(s string) layout.Length {
	s = strings.TrimSpace(s)
	if s == "" || s == "auto" {
		return layout.Auto
	}
	if strings.HasSuffix(s, "%") {
		if v, err := strconv.ParseFloat(strings.TrimSuffix(s, "%"), 32); err == nil {
			return layout.Pct(float32(v))
		}
		return layout.Auto
	}
	if v, err := strconv.ParseFloat(s, 32); err == nil {
		return layout.Pt(float32(v))
	}
	return layout.Auto
}

func parseFloat(s string) (float32, bool) {
	v, err := strconv.ParseFloat(strings.TrimSpace(s), 32)
	if err != nil {
		return 0, false
	}
	return float32(v), true
}

// applyStyle maps the node's style strings onto its layout box.
func (n *Node) applyStyle() {
	st := layout.New().Style
	switch n.Style["direction"] {
	case "row", "row-reverse", "Row":
		st.FlexDirection = layout.Row
	case "column", "col", "Column":
		st.FlexDirection = layout.Column
	}
	if n.Style["wrap"] == "wrap" {
		st.FlexWrap = layout.Wrap
	}
	if v, ok := parseFloat(n.Style["grow"]); ok {
		st.FlexGrow = v
	}
	if v, ok := parseFloat(n.Style["shrink"]); ok {
		st.FlexShrink = v
	}
	st.Width = parseLen(n.Style["width"])
	st.Height = parseLen(n.Style["height"])
	if gap, ok := parseFloat(n.Style["gap"]); ok {
		st.ColumnGap = layout.Pt(gap)
		st.RowGap = layout.Pt(gap)
	}
	if pad := strings.Fields(n.Style["padding"]); len(pad) > 0 {
		top := parseLen(pad[0])
		st.Padding.Top = top
		st.Padding.Right = top
		st.Padding.Bottom = top
		st.Padding.Left = top
		if len(pad) > 1 {
			side := parseLen(pad[1])
			st.Padding.Right = side
			st.Padding.Left = side
		}
	}
	switch n.Style["align"] {
	case "start":
		st.AlignItems = layout.AlignStart
	case "end":
		st.AlignItems = layout.AlignEnd
	case "center":
		st.AlignItems = layout.AlignCenter
	case "stretch":
		st.AlignItems = layout.AlignStretch
	}
	switch n.Style["justify"] {
	case "start":
		st.JustifyContent = layout.ContentStart
	case "end":
		st.JustifyContent = layout.ContentEnd
	case "center":
		st.JustifyContent = layout.ContentCenter
	case "space-between":
		st.JustifyContent = layout.ContentSpaceBetween
	case "space-around":
		st.JustifyContent = layout.ContentSpaceAround
	case "space-evenly":
		st.JustifyContent = layout.ContentSpaceEvenly
	}
	n.box.SetStyle(st)
}

// fontSize reads the node's FontSize schema prop, defaulting to 16pt.
func (n *Node) fontSize() float32 {
	if id, ok := commonProps["FontSize"]; ok {
		if v, ok := n.Props[id]; ok && v.Type == ops.TFloat {
			return float32(v.Float)
		}
	}
	return 16
}

// measureText estimates one laid-out line per explicit newline at a
// 0.6em monospace advance — the same rule ilha's estimateTextSize uses,
// so both sides of the FFI agree.
func measureText(text string, fs float32) layout.Size {
	lines := strings.Split(text, "\n")
	width := float32(0)
	for _, line := range lines {
		if w := float32(len(line)) * fs * 0.6; w > width {
			width = w
		}
	}
	return layout.Size{W: width, H: float32(len(lines)) * fs * 1.2}
}

// setMeasure installs the leaf measure function for measurable kinds:
// text (and text-like controls) size from their content, images from
// their style size or a 64pt default. Containers size from their style
// and children, like a host's native views do.
func (n *Node) setMeasure() {
	textOf := func(names ...string) string {
		for _, name := range names {
			if id, ok := propIDOf(n.Kind, name); ok {
				if v, ok := n.Props[id]; ok && v.Type == ops.TString {
					return v.Str
				}
			}
		}
		return ""
	}
	switch n.Kind {
	case ops.KindText:
		fs := n.fontSize()
		text := textOf("Text")
		n.box.SetMeasure(func(c layout.Constraints) layout.Size {
			return measureText(text, fs)
		})
	case ops.KindButton:
		fs := n.fontSize()
		text := textOf("Title")
		n.box.SetMeasure(func(c layout.Constraints) layout.Size {
			s := measureText(text, fs)
			s.W += 24
			s.H += 20
			if s.H < 28 {
				s.H = 28
			}
			return s
		})
	case ops.KindTextField:
		text := textOf("Value", "Placeholder")
		fs := n.fontSize()
		n.box.SetMeasure(func(c layout.Constraints) layout.Size {
			w := float32(200)
			if v, ok := parseFloat(n.Style["width"]); ok {
				w = v
			} else if m := measureText(text, fs).W + 24; m > w {
				w = m
			}
			h := float32(36)
			if v, ok := parseFloat(n.Style["height"]); ok {
				h = v
			}
			return layout.Size{W: w, H: h}
		})
	case ops.KindImage:
		n.box.SetMeasure(func(c layout.Constraints) layout.Size {
			w := float32(64)
			if v, ok := parseFloat(n.Style["width"]); ok {
				w = v
			}
			h := float32(64)
			if v, ok := parseFloat(n.Style["height"]); ok {
				h = v
			}
			return layout.Size{W: w, H: h}
		})
	case ops.KindToggle:
		n.box.SetMeasure(func(c layout.Constraints) layout.Size {
			return layout.Size{W: 51, H: 31}
		})
	case ops.KindSlider:
		n.box.SetMeasure(func(c layout.Constraints) layout.Size {
			w := c.AvailW
			if w != w || w > layout.MaxContentSpace || w <= 0 {
				w = 200
			}
			return layout.Size{W: w, H: 30}
		})
	default:
		n.box.SetMeasure(nil)
	}
}

// Layout runs Asuka's layout engine over the subtree under root within
// a w-by-h frame, writes each changed frame back into the store and
// appends a SetFrame op per changed node. It returns the number of
// nodes whose frame changed.
func (s *Store) Layout(root int64, w, h float32) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.nodes[root]; !ok {
		return 0
	}
	var build func(id int64) *layout.Node
	build = func(id int64) *layout.Node {
		n := s.nodes[id]
		n.applyStyle()
		n.setMeasure()
		kids := make([]*layout.Node, 0, len(n.Children))
		for _, child := range n.Children {
			if _, ok := s.nodes[child]; ok {
				kids = append(kids, build(child))
			}
		}
		n.box.SetChildren(kids)
		return n.box
	}
	box := build(root)
	box.MarkSubtreeDirty()
	s.pass.Changed = s.pass.Changed[:0]
	box.Layout(layout.Size{W: w, H: h}, &s.pass)
	for _, changed := range s.pass.Changed {
		id, ok := changed.Context.(int64)
		if !ok {
			continue
		}
		n, ok := s.nodes[id]
		if !ok {
			continue
		}
		n.Frame = [4]float32{changed.X, changed.Y, changed.W, changed.H}
		s.log.SetFrame(ops.NodeID(id), changed.X, changed.Y, changed.W, changed.H)
	}
	// The root's own frame is the viewport even when unchanged.
	if n, ok := s.nodes[root]; ok {
		n.Frame = [4]float32{0, 0, w, h}
	}
	return len(s.pass.Changed)
}

// Batch returns a copy of the recorded op log for hosts to apply.
func (s *Store) Batch() ops.Batch {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := ops.Batch{}
	out.Ops = append(out.Ops, s.log.Ops...)
	return out
}

// Package-level mirrors over the default store.

func Reset() { Default.Reset() }

func Create(kind ops.Kind) int64 { return Default.Create(kind) }

func SetString(id int64, prop ops.PropID, value string) bool {
	return Default.SetString(id, prop, value)
}

func SetInt(id int64, prop ops.PropID, value int64) bool {
	return Default.SetInt(id, prop, value)
}

func SetFloat(id int64, prop ops.PropID, value float64) bool {
	return Default.SetFloat(id, prop, value)
}

func SetBool(id int64, prop ops.PropID, value bool) bool {
	return Default.SetBool(id, prop, value)
}

func SetEnum(id int64, prop ops.PropID, value int32) bool {
	return Default.SetEnum(id, prop, value)
}

func SetProp(id int64, key, value string) bool { return Default.SetProp(id, key, value) }

func SetStyle(id int64, key, value string) bool { return Default.SetStyle(id, key, value) }

func SetAttr(id int64, key, value string) bool { return Default.SetAttr(id, key, value) }

func DelProp(id int64, key string) bool { return Default.DelProp(id, key) }

func Insert(parent, child int64, index int) bool { return Default.Insert(parent, child, index) }

func Remove(parent, child int64) bool { return Default.Remove(parent, child) }

func Destroy(id int64) bool { return Default.Destroy(id) }

func Listen(id int64, event ops.EventKind) bool { return Default.Listen(id, event) }

func Unlisten(id int64, event ops.EventKind) bool { return Default.Unlisten(id, event) }

func SetRoot(id int64) bool { return Default.SetRoot(id) }

func Layout(root int64, w, h float32) int { return Default.Layout(root, w, h) }

func Count() int { return Default.Count() }

func Describe(id int64) (string, bool) { return Default.Describe(id) }

func Ops() []string { return Default.Ops() }

func Batch() ops.Batch { return Default.Batch() }
