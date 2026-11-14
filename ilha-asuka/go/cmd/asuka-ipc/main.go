// Command asuka-ipc serves the shared Asuka-protocol store over a JSON
// line protocol on stdin/stdout — the child-process fallback transport
// when bun:ffi cannot load the shared library. One request per line:
//
//	{"id":1,"op":"create","kind":2}
//	{"id":2,"op":"setString","node":1,"prop":64,"value":"hi"}
//	{"id":3,"op":"setStyle","node":1,"key":"direction","value":"column"}
//	{"id":4,"op":"insert","parent":1,"child":2,"index":0}
//	{"id":5,"op":"remove","parent":1,"child":2}
//	{"id":6,"op":"destroy","node":2}
//	{"id":7,"op":"listen","node":1,"event":1}
//	{"id":8,"op":"setRoot","node":1}
//	{"id":9,"op":"layout","node":1,"width":390,"height":844}
//	{"id":10,"op":"describe","node":1}
//	{"id":11,"op":"ops"}
//	{"id":12,"op":"reset"}
//	{"id":13,"op":"version"}
//	{"id":14,"op":"delProp","node":1,"key":"Text"}
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

	core "ilha-asuka/go"
)

type request struct {
	ID     uint64  `json:"id"`
	Op     string  `json:"op"`
	Kind   int32   `json:"kind"`
	Node   int64   `json:"node"`
	Parent int64   `json:"parent"`
	Child  int64   `json:"child"`
	Index  int     `json:"index"`
	Prop   int32   `json:"prop"`
	Key    string  `json:"key"`
	Value  string  `json:"value"`
	Int    int64   `json:"int"`
	Float  float64 `json:"float"`
	Bool   bool    `json:"bool"`
	Event  int32   `json:"event"`
	Width  float32 `json:"width"`
	Height float32 `json:"height"`
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
		return response{ID: req.ID, OK: true, Result: core.Version}
	case "reset":
		core.Reset()
		return response{ID: req.ID, OK: true, Result: true}
	case "create":
		id := core.Create(core.Kind(req.Kind))
		if id == 0 {
			return fail(req.ID, "unknown kind")
		}
		return response{ID: req.ID, OK: true, Result: id}
	case "setString":
		return response{ID: req.ID, OK: true, Result: core.SetString(req.Node, core.PropID(req.Prop), req.Value)}
	case "setInt":
		return response{ID: req.ID, OK: true, Result: core.SetInt(req.Node, core.PropID(req.Prop), req.Int)}
	case "setFloat":
		return response{ID: req.ID, OK: true, Result: core.SetFloat(req.Node, core.PropID(req.Prop), req.Float)}
	case "setBool":
		return response{ID: req.ID, OK: true, Result: core.SetBool(req.Node, core.PropID(req.Prop), req.Bool)}
	case "setEnum":
		return response{ID: req.ID, OK: true, Result: core.SetEnum(req.Node, core.PropID(req.Prop), int32(req.Int))}
	case "setStyle":
		return response{ID: req.ID, OK: true, Result: core.SetStyle(req.Node, req.Key, req.Value)}
	case "setAttr":
		return response{ID: req.ID, OK: true, Result: core.SetAttr(req.Node, req.Key, req.Value)}
	case "setProp":
		return response{ID: req.ID, OK: true, Result: core.SetProp(req.Node, req.Key, req.Value)}
	case "insert":
		return response{ID: req.ID, OK: true, Result: core.Insert(req.Parent, req.Child, req.Index)}
	case "remove":
		return response{ID: req.ID, OK: true, Result: core.Remove(req.Parent, req.Child)}
	case "destroy":
		return response{ID: req.ID, OK: true, Result: core.Destroy(req.Node)}
	case "listen":
		return response{ID: req.ID, OK: true, Result: core.Listen(req.Node, core.Event(req.Event))}
	case "unlisten":
		return response{ID: req.ID, OK: true, Result: core.Unlisten(req.Node, core.Event(req.Event))}
	case "setRoot":
		return response{ID: req.ID, OK: true, Result: core.SetRoot(req.Node)}
	case "layout":
		return response{ID: req.ID, OK: true, Result: core.Layout(req.Node, req.Width, req.Height)}
	case "delProp":
		return response{ID: req.ID, OK: true, Result: core.DelProp(req.Node, req.Key)}
	case "describe":
		s, ok := core.Describe(req.Node)
		if !ok {
			return fail(req.ID, "unknown node")
		}
		var raw json.RawMessage = []byte(s)
		return response{ID: req.ID, OK: true, Result: raw}
	case "ops":
		return response{ID: req.ID, OK: true, Result: core.Ops()}
	case "count":
		return response{ID: req.ID, OK: true, Result: core.Count()}
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
