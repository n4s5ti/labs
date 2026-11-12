// Command mygo-ipc serves the shared mygo store over a JSON line
// protocol on stdin/stdout — the child-process fallback transport when
// bun:ffi cannot load the shared library. One request per line:
//
//	{"id":1,"op":"create","kind":"div"}
//	{"id":2,"op":"setProp","node":1,"key":"x","value":"1"}
//	{"id":3,"op":"attach","parent":1,"child":2}
//	{"id":4,"op":"detach","parent":1,"child":2}
//	{"id":5,"op":"remove","node":1}
//	{"id":6,"op":"count"}
//	{"id":7,"op":"describe","node":1}
//	{"id":8,"op":"reset"}
//	{"id":9,"op":"version"}
//	{"id":10,"op":"delProp","node":1,"key":"x"}
//
// Every line gets exactly one response line:
//
//	{"id":1,"ok":true,"result":1}
//	{"id":2,"ok":false,"error":"unknown op"}
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"

	mygo "ilha-mygo/go"
)

type request struct {
	ID     uint64 `json:"id"`
	Op     string `json:"op"`
	Kind   string `json:"kind"`
	Node   int64  `json:"node"`
	Parent int64  `json:"parent"`
	Child  int64  `json:"child"`
	Key    string `json:"key"`
	Value  string `json:"value"`
}

type response struct {
	ID     uint64 `json:"id"`
	OK     bool   `json:"ok"`
	Result any    `json:"result,omitempty"`
	Error  string `json:"error,omitempty"`
}

func fail(id uint64, err string) response {
	return response{ID: id, Error: err}
}

func handle(req request) response {
	switch req.Op {
	case "version":
		return response{ID: req.ID, OK: true, Result: mygo.Version}
	case "reset":
		mygo.Reset()
		return response{ID: req.ID, OK: true, Result: true}
	case "create":
		return response{ID: req.ID, OK: true, Result: mygo.Create(req.Kind)}
	case "setProp":
		return response{ID: req.ID, OK: true, Result: mygo.SetProp(req.Node, req.Key, req.Value)}
	case "attach":
		return response{ID: req.ID, OK: true, Result: mygo.Attach(req.Parent, req.Child)}
	case "detach":
		return response{ID: req.ID, OK: true, Result: mygo.Detach(req.Parent, req.Child)}
	case "delProp":
		return response{ID: req.ID, OK: true, Result: mygo.DelProp(req.Node, req.Key)}
	case "remove":
		return response{ID: req.ID, OK: true, Result: mygo.Remove(req.Node)}
	case "count":
		return response{ID: req.ID, OK: true, Result: mygo.Count()}
	case "describe":
		s, ok := mygo.Describe(req.Node)
		if !ok {
			return fail(req.ID, "unknown node")
		}
		var raw json.RawMessage = []byte(s)
		return response{ID: req.ID, OK: true, Result: raw}
	default:
		return fail(req.ID, "unknown op")
	}
}

func main() {
	in := bufio.NewScanner(os.Stdin)
	in.Buffer(make([]byte, 64*1024), 10*1024*1024)
	out := bufio.NewWriter(os.Stdout)
	defer out.Flush()
	enc := json.NewEncoder(out)
	for in.Scan() {
		var req request
		if err := json.Unmarshal(in.Bytes(), &req); err != nil {
			if err := enc.Encode(fail(0, "bad request")); err != nil {
				fmt.Fprintln(os.Stderr, err)
			}
			continue
		}
		if err := enc.Encode(handle(req)); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return
		}
		out.Flush()
	}
}
