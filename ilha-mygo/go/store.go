// Package mygo implements the retained scene-graph store behind the
// ilha-mygo experiment: a minimal host whose nodes are manipulated from
// Bun either through c-shared FFI (lib.go) or the JSON line protocol
// (cmd/mygo-ipc). Both transports share this store, so a tree built over
// one transport reads back identically over the other.
package mygo

import (
	"encoding/json"
	"sync"
)

// Version is the store schema version served over every transport.
const Version = 1

// Node is one retained host node: an element kind, string props, and an
// ordered child-handle list.
type Node struct {
	ID       int64             `json:"id"`
	Kind     string            `json:"kind"`
	Props    map[string]string `json:"props"`
	Children []int64           `json:"children"`
}

// nodeJSON is the recursive expansion served by Describe.
type nodeJSON struct {
	ID       int64             `json:"id"`
	Kind     string            `json:"kind"`
	Props    map[string]string `json:"props"`
	Children []*nodeJSON       `json:"children"`
}

// Store is a concurrency-safe retained node set. Handles start at 1;
// 0 is never a valid node.
type Store struct {
	mu    sync.Mutex
	next  int64
	nodes map[int64]*Node
}

// NewStore returns an empty store.
func NewStore() *Store {
	return &Store{next: 1, nodes: make(map[int64]*Node)}
}

// Default is the process-wide store shared by the FFI and IPC transports.
var Default = NewStore()

// Reset drops every node and restarts handle allocation at 1.
func (s *Store) Reset() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.next = 1
	s.nodes = make(map[int64]*Node)
}

// Create adds a node of the given kind and returns its handle.
func (s *Store) Create(kind string) int64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	id := s.next
	s.next++
	s.nodes[id] = &Node{ID: id, Kind: kind, Props: make(map[string]string)}
	return id
}

// SetProp records a prop; it reports whether the node exists.
func (s *Store) SetProp(id int64, key, value string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	n, ok := s.nodes[id]
	if !ok {
		return false
	}
	n.Props[key] = value
	return true
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

// Attach appends child to parent's children (no duplicates). It refuses
// unknown handles and attachments that would create a cycle.
func (s *Store) Attach(parent, child int64) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.nodes[parent]
	if !ok {
		return false
	}
	if _, ok := s.nodes[child]; !ok {
		return false
	}
	if s.descendantOf(parent, child) {
		return false
	}
	for _, existing := range p.Children {
		if existing == child {
			return true
		}
	}
	p.Children = append(p.Children, child)
	return true
}

// DelProp deletes a prop; it reports whether the node exists.
func (s *Store) DelProp(id int64, key string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	n, ok := s.nodes[id]
	if !ok {
		return false
	}
	delete(n.Props, key)
	return true
}

// Detach removes child from parent's children. Unknown handles report false;
// detaching an absent child is a no-op success.
func (s *Store) Detach(parent, child int64) bool {
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
	for _, existing := range p.Children {
		if existing != child {
			kept = append(kept, existing)
		}
	}
	p.Children = kept
	return true
}

// Remove deletes the node and its whole subtree, detaching it from every
// parent first. Unknown handles report false.
func (s *Store) Remove(id int64) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.nodes[id]; !ok {
		return false
	}
	for _, n := range s.nodes {
		kept := n.Children[:0]
		for _, child := range n.Children {
			if child != id {
				kept = append(kept, child)
			}
		}
		n.Children = kept
	}
	var drop func(nodeID int64)
	drop = func(nodeID int64) {
		n, ok := s.nodes[nodeID]
		if !ok {
			return
		}
		delete(s.nodes, nodeID)
		for _, child := range n.Children {
			drop(child)
		}
	}
	drop(id)
	return true
}

// Count returns the number of live nodes.
func (s *Store) Count() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.nodes)
}

func (s *Store) expand(id int64) *nodeJSON {
	n, ok := s.nodes[id]
	if !ok {
		return nil
	}
	out := &nodeJSON{ID: n.ID, Kind: n.Kind, Props: n.Props, Children: []*nodeJSON{}}
	for _, child := range n.Children {
		if expanded := s.expand(child); expanded != nil {
			out.Children = append(out.Children, expanded)
		}
	}
	return out
}

// Describe renders the node's subtree as JSON. Unknown handles report false.
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

// Reset drops every node in the default store.
func Reset() { Default.Reset() }

// Create adds a node of the given kind to the default store.
func Create(kind string) int64 { return Default.Create(kind) }

// SetProp records a prop on a default-store node.
func SetProp(id int64, key, value string) bool { return Default.SetProp(id, key, value) }

// Attach appends child to parent in the default store.
func Attach(parent, child int64) bool { return Default.Attach(parent, child) }

// Detach removes child from parent in the default store.
func Detach(parent, child int64) bool { return Default.Detach(parent, child) }

// DelProp deletes a prop on a default-store node.
func DelProp(id int64, key string) bool { return Default.DelProp(id, key) }

// Remove deletes a subtree from the default store.
func Remove(id int64) bool { return Default.Remove(id) }

// Count returns the live node count of the default store.
func Count() int { return Default.Count() }

// Describe renders a default-store subtree as JSON.
func Describe(id int64) (string, bool) { return Default.Describe(id) }
