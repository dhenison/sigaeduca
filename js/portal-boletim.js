/**
 * Portal do Aluno — Boletins publicados (IndexedDB + meta já usados pelo módulo de boletins).
 */
(function (global) {
  "use strict";

  var STATUS_KEY = "siga_boletim_status";
  var META_KEY = "siga_boletim_meta";
  var DB_NAME = "siga_boletins_db";
  var STORE = "pdfs";

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getStatusMap() {
    try {
      return JSON.parse(localStorage.getItem(STATUS_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function getMetaMap() {
    try {
      return JSON.parse(localStorage.getItem(META_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function statusKey(turma, ano, bimestre) {
    return [turma, ano, bimestre].join("|");
  }

  function isPublished(rec) {
    var map = getStatusMap();
    var info = map[statusKey(rec.turma, rec.ano, rec.bimestre)];
    if (!info) return true;
    return info.status === "Publicado";
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbListByAluno(alunoId) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readonly");
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function () {
          var all = req.result || [];
          resolve(all.filter(function (r) {
            return String(r.alunoId) === String(alunoId);
          }));
        };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function listForStudent(alunoId) {
    return idbListByAluno(alunoId).then(function (list) {
      var meta = getMetaMap();
      Object.keys(meta).forEach(function (k) {
        if (String(meta[k].alunoId) === String(alunoId) && !list.find(function (x) { return x.id === k; })) {
          list.push(Object.assign({ id: k }, meta[k]));
        }
      });
      return list.filter(isPublished).sort(function (a, b) {
        return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
      });
    }).catch(function () {
      return [];
    });
  }

  function render(list) {
    var host = document.getElementById("portal-boletim-lista");
    var empty = document.getElementById("portal-boletim-empty");
    if (!host) return;
    if (!list.length) {
      host.innerHTML = "";
      if (empty) empty.classList.remove("hidden");
      return;
    }
    if (empty) empty.classList.add("hidden");
    host.innerHTML = list.map(function (b) {
      return (
        '<article class="portal-card portal-press p-4 flex items-center gap-3">' +
        '<div class="w-11 h-11 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">' +
        '<span class="material-symbols-outlined">picture_as_pdf</span></div>' +
        '<div class="min-w-0 flex-1">' +
        '<p class="font-bold text-slate-900 truncate">' +
        escapeHtml(b.fileName || ("Boletim " + (b.bimestre || ""))) +
        "</p>" +
        '<p class="text-xs text-slate-500 mt-0.5">' +
        escapeHtml((b.bimestre || "") + (b.ano ? " · " + b.ano : "") + (b.turma ? " · Turma " + b.turma : "")) +
        "</p></div>" +
        '<button type="button" class="text-sm font-bold text-blue-700" data-open-boletim="' +
        escapeHtml(b.id) +
        '">Abrir</button></article>'
      );
    }).join("");

    host.querySelectorAll("[data-open-boletim]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-open-boletim");
        if (typeof global.openBoletimPdf === "function") {
          global.openBoletimPdf(id, "view");
        }
      });
    });
  }

  function boot(ctx) {
    var student = (ctx && ctx.student) || {};
    var nome = document.getElementById("portal-bol-aluno");
    if (nome) nome.textContent = student.nome || "";
    if (!student.id) {
      render([]);
      return Promise.resolve();
    }
    return listForStudent(student.id).then(render);
  }

  global.SigaPortalBoletim = { boot: boot };
})(typeof window !== "undefined" ? window : this);
