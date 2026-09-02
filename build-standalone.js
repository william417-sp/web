/* Empaqueta la app en un solo archivo HTML, sin dependencias ni build tools.
   Uso:  node build-standalone.js
   Sale:  quiet-process.standalone.html   (documento completo, para subir a
                                           cualquier hosting o abrir directo)
          .artifact/quiet-process.body.html
                                          (sólo el contenido, para incrustar
                                           donde ya hay <head> y <body>) */
"use strict";
var fs = require("fs");
var path = require("path");

var ORDER = ["core", "tasks", "goals", "notes", "train", "money", "study", "review", "demo", "boot"];

function read(p) { return fs.readFileSync(path.join(__dirname, p), "utf8"); }

var css = read("quiet-process.css");
var shell = read("quiet-process.html");
var js = ORDER.map(function (name) {
  return "/* ─── qp/" + name + ".js ─── */\n" + read("qp/" + name + ".js");
}).join("\n\n");

// Un "</script>" dentro del JS cerraría la etiqueta antes de tiempo.
[["CSS", css, "</style"], ["JS", js, "</script"]].forEach(function (c) {
  if (c[1].toLowerCase().indexOf(c[2]) !== -1) {
    throw new Error("El " + c[0] + " contiene «" + c[2] + "»: hay que escaparlo antes de incrustarlo.");
  }
});

var themeBoot = shell.match(/<script>\n\/\* Se marca el tema[\s\S]*?<\/script>/);
if (!themeBoot) throw new Error("No encuentro el script de tema en quiet-process.html.");

// El cuerpo del esqueleto, sin las etiquetas <script src> que ya inlineamos.
var body = shell
  .slice(shell.indexOf("<body>") + "<body>".length, shell.lastIndexOf("</body>"))
  .replace(/\n<script src="qp\/[^"]+"><\/script>/g, "")
  .trim();

var title = (shell.match(/<title>([^<]*)<\/title>/) || [, "Quiet Process"])[1];
var desc = (shell.match(/<meta name="description" content="([^"]*)"/) || [, ""])[1];
var icon = (shell.match(/<link rel="icon" href="([^"]*)">/) || [, ""])[1];

var stamp = "<!-- Generado por build-standalone.js — no editar a mano: " +
  "los cambios van en quiet-process.html, quiet-process.css y qp/*.js. -->";

var inner = [
  stamp,
  "<title>" + title + "</title>",
  themeBoot[0],
  "<style>\n" + css + "\n</style>",
  body,
  "<script>\n" + js + "\n</script>"
].join("\n\n");

fs.mkdirSync(path.join(__dirname, ".artifact"), { recursive: true });
fs.writeFileSync(path.join(__dirname, ".artifact/quiet-process.body.html"), inner + "\n");

var full = [
  "<!DOCTYPE html>",
  '<html lang="es">',
  "<head>",
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  desc ? '<meta name="description" content="' + desc + '">' : "",
  icon ? '<link rel="icon" href="' + icon + '">' : "",
  "</head>",
  "<body>",
  inner,
  "</body>",
  "</html>"
].filter(Boolean).join("\n");

fs.writeFileSync(path.join(__dirname, "quiet-process.standalone.html"), full + "\n");

var kb = function (s) { return (Buffer.byteLength(s) / 1024).toFixed(0) + " KB"; };
console.log("quiet-process.standalone.html        " + kb(full));
console.log(".artifact/quiet-process.body.html    " + kb(inner));
