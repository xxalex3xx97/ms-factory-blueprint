// tiny static server for the site (root = worktree): node tools/serve.mjs [port]
import http from "http";import fs from "fs";import path from "path";import {fileURLToPath} from "url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");const port=+process.argv[2]||8765;
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css",".json":"application/json",".png":"image/png",".svg":"image/svg+xml"};
http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split("?")[0]);if(p==="/")p="/index.html";const f=path.join(root,p);if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end("not found");return}
  res.writeHead(200,{"content-type":types[path.extname(f)]||"application/octet-stream","cache-control":"no-store"});fs.createReadStream(f).pipe(res)}).listen(port,"127.0.0.1",()=>console.log("serving",root,"on",port));

