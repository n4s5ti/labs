package core

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/egoist/asuka/host/fake"
	"github.com/egoist/asuka/ops"
)

func textProp(t *testing.T) ops.PropID {
	t.Helper()
	id, ok := propIDOf(ops.KindText, "Text")
	if !ok {
		t.Fatal("schema has no Text.Text prop")
	}
	return id
}

func TestVersionAndCRUD(t *testing.T) {
	s := NewStore()
	if Version != 2 {
		t.Fatalf("Version = %d, want 2 (Asuka op protocol)", Version)
	}
	if id := s.Create(ops.Kind(999)); id != 0 {
		t.Fatalf("Create(unknown kind) = %d, want 0", id)
	}
	root := s.Create(ops.KindView)
	if root != 1 {
		t.Fatalf("first handle = %d, want 1", root)
	}
	if !s.SetProp(root, "direction", "column") {
		t.Fatal("SetProp style input refused")
	}
	text := s.Create(ops.KindText)
	if !s.SetString(text, textProp(t), "hello") {
		t.Fatal("SetString Text.Text refused")
	}
	// Wire-type mismatches report false: a real host could never apply them.
	if s.SetBool(text, textProp(t), true) {
		t.Fatal("SetBool on a TString prop accepted")
	}
	if s.SetString(text, ops.PropID(20), "x") {
		t.Fatal("SetString on a TBool prop (Disabled) accepted")
	}
	if s.SetString(999, textProp(t), "x") {
		t.Fatal("SetString on unknown node accepted")
	}
	if !s.Insert(root, text, 0) {
		t.Fatal("Insert refused")
	}
	if s.Count() != 2 {
		t.Fatalf("Count = %d, want 2", s.Count())
	}
	raw, ok := s.Describe(root)
	if !ok {
		t.Fatal("Describe refused")
	}
	var tree nodeJSON
	if err := json.Unmarshal([]byte(raw), &tree); err != nil {
		t.Fatal(err)
	}
	if tree.Kind != "View" || tree.KindID != 1 {
		t.Fatalf("root kind = %s/%d, want View/1", tree.Kind, tree.KindID)
	}
	if tree.Props["direction"] != "column" {
		t.Fatalf("style prop missing: %v", tree.Props)
	}
	kids := tree.Children
	if len(kids) != 1 || kids[0].Props["Text"] != "hello" {
		t.Fatalf("unexpected children: %+v", kids)
	}
	if !s.DelProp(text, "Text") {
		t.Fatal("DelProp refused")
	}
	if !s.Destroy(root) {
		t.Fatal("Destroy refused")
	}
	if s.Count() != 0 {
		t.Fatalf("Count after Destroy = %d, want 0", s.Count())
	}
	// Handles are never reused within a process, matching Asuka's
	// NodeID rule — only Reset restarts allocation.
	if s.Create(ops.KindView) != 3 {
		t.Fatal("handle was reused without a Reset")
	}
	s.Reset()
	if s.Count() != 0 || s.Create(ops.KindView) != 1 {
		t.Fatal("Reset did not restart the store")
	}
}

func TestInsertSemantics(t *testing.T) {
	s := NewStore()
	a := s.Create(ops.KindView)
	b := s.Create(ops.KindView)
	c := s.Create(ops.KindView)
	if !s.Insert(a, b, 0) || !s.Insert(a, c, 0) {
		t.Fatal("Insert refused")
	}
	raw, _ := s.Describe(a)
	var tree nodeJSON
	if err := json.Unmarshal([]byte(raw), &tree); err != nil {
		t.Fatal(err)
	}
	// Index 0 twice: c lands before b.
	if len(tree.Children) != 2 || tree.Children[0].ID != c || tree.Children[1].ID != b {
		t.Fatalf("insert order wrong: %+v", tree.Children)
	}
	// A child with a parent is refused — move it with Remove first,
	// exactly as a real host requires.
	if s.Insert(c, b, 0) {
		t.Fatal("reparenting Insert accepted")
	}
	if !s.Remove(a, b) || !s.Insert(c, b, 5) {
		t.Fatal("remove-then-insert refused")
	}
	// Out-of-range indexes clamp instead of failing.
	raw, _ = s.Describe(c)
	if err := json.Unmarshal([]byte(raw), &tree); err != nil {
		t.Fatal(err)
	}
	if len(tree.Children) != 1 || tree.Children[0].ID != b {
		t.Fatalf("clamped insert wrong: %+v", tree.Children)
	}
	// Cycles and unknown handles are refused.
	if s.Insert(b, c, 0) || s.Insert(b, b, 0) {
		t.Fatal("cyclic Insert accepted")
	}
	if s.Insert(a, 999, 0) || s.Insert(999, b, 0) || s.Remove(a, 999) {
		t.Fatal("unknown-handle Insert/Remove accepted")
	}
	// A Scroll holds one child.
	scroll := s.Create(ops.KindScroll)
	one := s.Create(ops.KindText)
	two := s.Create(ops.KindText)
	if !s.Insert(scroll, one, 0) {
		t.Fatal("Scroll Insert refused")
	}
	if s.Insert(scroll, two, 1) {
		t.Fatal("second Scroll child accepted")
	}
}

func TestListenUnlisten(t *testing.T) {
	s := NewStore()
	b := s.Create(ops.KindButton)
	if !s.Listen(b, ops.EventPress) {
		t.Fatal("Listen Press refused")
	}
	if s.Listen(b, ops.EventKind(999)) {
		t.Fatal("Listen on unknown event accepted")
	}
	if s.Listen(999, ops.EventPress) {
		t.Fatal("Listen on unknown node accepted")
	}
	if !s.Unlisten(b, ops.EventPress) {
		t.Fatal("Unlisten refused")
	}
	raw, _ := s.Describe(b)
	var tree nodeJSON
	if err := json.Unmarshal([]byte(raw), &tree); err != nil {
		t.Fatal(err)
	}
	if len(tree.Listens) != 0 {
		t.Fatalf("listens = %v, want empty", tree.Listens)
	}
	if !s.Listen(b, ops.EventPress) {
		t.Fatal("re-Listen refused")
	}
	raw, _ = s.Describe(b)
	if err := json.Unmarshal([]byte(raw), &tree); err != nil {
		t.Fatal(err)
	}
	if len(tree.Listens) != 1 || tree.Listens[0] != "Press" {
		t.Fatalf("listens = %v, want [Press]", tree.Listens)
	}
}

func buildColumn(t *testing.T, s *Store) (root, first, second int64) {
	t.Helper()
	root = s.Create(ops.KindView)
	if !s.SetProp(root, "direction", "column") ||
		!s.SetProp(root, "gap", "8") ||
		!s.SetProp(root, "padding", "16") {
		t.Fatal("column style refused")
	}
	first = s.Create(ops.KindText)
	second = s.Create(ops.KindText)
	tp := textProp(t)
	if !s.SetString(first, tp, "hello") || !s.SetString(second, tp, "counter") {
		t.Fatal("text content refused")
	}
	if !s.Insert(root, first, 0) || !s.Insert(root, second, 1) {
		t.Fatal("column children refused")
	}
	return root, first, second
}

func frameOf(t *testing.T, s *Store, root, id int64) [4]float32 {
	t.Helper()
	raw, ok := s.Describe(root)
	if !ok {
		t.Fatal("Describe refused")
	}
	var tree nodeJSON
	if err := json.Unmarshal([]byte(raw), &tree); err != nil {
		t.Fatal(err)
	}
	var find func(n *nodeJSON) *[4]float32
	find = func(n *nodeJSON) *[4]float32 {
		if n.ID == id {
			return &n.Frame
		}
		for _, c := range n.Children {
			if f := find(c); f != nil {
				return f
			}
		}
		return nil
	}
	if f := find(&tree); f != nil {
		return *f
	}
	t.Fatalf("node %d missing from tree", id)
	return [4]float32{}
}

func TestLayoutColumnStacks(t *testing.T) {
	s := NewStore()
	root, first, second := buildColumn(t, s)
	if n := s.Layout(root, 390, 844); n == 0 {
		t.Fatal("Layout changed nothing")
	}
	rf := frameOf(t, s, root, root)
	if rf != [4]float32{0, 0, 390, 844} {
		t.Fatalf("root frame = %v, want the viewport", rf)
	}
	f1 := frameOf(t, s, root, first)
	f2 := frameOf(t, s, root, second)
	// Padding 16, gap 8, stretch default: both texts share the widest
	// measure (67.2 for "counter") and stack with a full gap between.
	near := func(got, want [4]float32) bool {
		for i := range got {
			d := got[i] - want[i]
			if d < -0.01 || d > 0.01 {
				return false
			}
		}
		return true
	}
	if !near(f1, [4]float32{16, 16, 67.2, 19.2}) {
		t.Fatalf("first frame = %v, want stretched monospace measure", f1)
	}
	if !near(f2, [4]float32{16, 43.2, 67.2, 19.2}) {
		t.Fatalf("second frame = %v, want it gapped below %v", f2, f1)
	}
	// Frames are served and logged as SetFrame ops.
	found := false
	for _, line := range s.Ops() {
		if strings.HasPrefix(line, "SetFrame") {
			found = true
		}
	}
	if !found {
		t.Fatalf("no SetFrame in op log: %v", s.Ops())
	}
}

func TestLayoutRowFlows(t *testing.T) {
	s := NewStore()
	root := s.Create(ops.KindView)
	if !s.SetProp(root, "direction", "row") || !s.SetProp(root, "gap", "4") {
		t.Fatal("row style refused")
	}
	a := s.Create(ops.KindText)
	b := s.Create(ops.KindButton)
	tp := textProp(t)
	title, ok := propIDOf(ops.KindButton, "Title")
	if !ok {
		t.Fatal("schema has no Button.Title prop")
	}
	if !s.SetString(a, tp, "counter") || !s.SetString(b, title, "press") {
		t.Fatal("content refused")
	}
	if !s.Insert(root, a, 0) || !s.Insert(root, b, 1) {
		t.Fatal("row children refused")
	}
	s.Layout(root, 390, 844)
	fa := frameOf(t, s, root, a)
	fb := frameOf(t, s, root, b)
	if fb[0] <= fa[0]+fa[2] {
		t.Fatalf("row frames overlap: a=%v b=%v", fa, fb)
	}
	// The button measures its title plus chrome, wider than the text run.
	if fb[2] <= fa[2] {
		t.Fatalf("button frame %v not wider than text frame %v", fb, fa)
	}
}

// TestFakeHostConformance replays the recorded op log onto Asuka's own
// fake host: every op ilha-asuka emits must be one a real host applies.
func TestFakeHostConformance(t *testing.T) {
	s := NewStore()
	root, first, second := buildColumn(t, s)
	btn := s.Create(ops.KindButton)
	title, _ := propIDOf(ops.KindButton, "Title")
	variant, _ := propIDOf(ops.KindButton, "Variant")
	if !s.SetString(btn, title, "press") || !s.SetEnum(btn, variant, 1) {
		t.Fatal("button props refused")
	}
	if !s.Insert(root, btn, 2) || !s.Listen(btn, ops.EventPress) {
		t.Fatal("button mount refused")
	}
	if !s.SetRoot(root) {
		t.Fatal("SetRoot refused")
	}
	s.Layout(root, 390, 844)

	batch := s.Batch()
	host := fake.New()
	host.Apply(&batch) // panics on any op a real host could not apply

	if got := len(host.Views); got != s.Count() {
		t.Fatalf("fake views = %d, store nodes = %d", got, s.Count())
	}
	views := host.OfKind(ops.KindText)
	if len(views) != 2 {
		t.Fatalf("fake texts = %d, want 2", len(views))
	}
	textID, _ := propIDOf(ops.KindText, "Text")
	strs := map[string]bool{}
	for _, v := range views {
		strs[v.Props[textID].Str] = true
	}
	if !strs["hello"] || !strs["counter"] {
		t.Fatalf("fake text content = %v", strs)
	}
	fakeFirst := host.Views[ops.NodeID(first)]
	if fakeFirst == nil {
		t.Fatal("first text missing from fake host")
	}
	want := frameOf(t, s, root, first)
	if fakeFirst.Frame != want {
		t.Fatalf("fake frame = %v, store frame = %v", fakeFirst.Frame, want)
	}
	fakeBtn := host.Views[ops.NodeID(btn)]
	if fakeBtn == nil || !fakeBtn.Listens[ops.EventPress] {
		t.Fatal("button Press listen missing from fake host")
	}
	_ = second
}

// TestBatchBinaryRoundTrip proves the log also survives Asuka's binary
// encoding — the form mobile hosts read.
func TestBatchBinaryRoundTrip(t *testing.T) {
	s := NewStore()
	root, _, _ := buildColumn(t, s)
	if !s.SetRoot(root) {
		t.Fatal("SetRoot refused")
	}
	s.Layout(root, 390, 844)
	batch := s.Batch()
	raw := batch.Encode()
	var decoded ops.Batch
	if err := decoded.Decode(raw); err != nil {
		t.Fatal(err)
	}
	if decoded.Len() != batch.Len() {
		t.Fatalf("decoded %d ops, want %d", decoded.Len(), batch.Len())
	}
}
