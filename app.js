/* ==============================================================
   Hanzi Tools — Application Logic
   Pinyin conversion, stroke-order animation, and video export.

   Libraries expected as globals:
     pinyinPro  — from https://cdn.jsdelivr.net/npm/pinyin-pro
     HanziWriter — from https://cdn.jsdelivr.net/npm/hanzi-writer@3.5
   ============================================================== */

(function () {
  "use strict";

  // ──────────────────────────────────────────────
  // Library detection
  // ──────────────────────────────────────────────
  var pinyinReady =
    typeof window.pinyinPro !== "undefined" &&
    typeof window.pinyinPro.pinyin === "function";

  var hanziWriterReady = typeof window.HanziWriter !== "undefined";

  (function showLibWarnings() {
    var msgs = [];
    if (!pinyinReady) msgs.push("pinyin-pro did not load — Pinyin conversion unavailable.");
    if (!hanziWriterReady) msgs.push("HanziWriter did not load — stroke animation unavailable.");
    if (msgs.length === 0) return;

    var el = document.getElementById("lib-status");
    if (!el) return;
    el.textContent = msgs.join(" ");
    el.hidden = false;
    console.warn("[Hanzi Tools]", msgs.join(" "));
  })();

  // ──────────────────────────────────────────────
  // State
  // ──────────────────────────────────────────────
  var state = {
    activeChar: null,     // single character shown in the animator
    writer: null,         // current HanziWriter instance
    pinyinText: "",       // latest pinyin output
    animationSpeed: 1,
    writerSize: 400,
    strokeColor: "#333333",
    highlightRadical: false,
    radicalColor: "#e74c3c",
    isRecording: false,
  };

  // ──────────────────────────────────────────────
  // DOM references
  // ──────────────────────────────────────────────
  var dom = {
    // Pinyin section
    pinyinInput: document.getElementById("pinyin-input"),
    pinyinConvertBtn: document.getElementById("pinyin-convert-btn"),
    pinyinOutput: document.getElementById("pinyin-output"),
    copyBtn: document.getElementById("copy-btn"),
    copyBtnText: document.getElementById("copy-btn-text"),

    // Stroke section
    strokeInput: document.getElementById("stroke-input"),
    strokeShowBtn: document.getElementById("stroke-show-btn"),
    strokeError: document.getElementById("stroke-error"),
    writerTarget: document.getElementById("hanzi-writer-target"),
    writerPlaceholder: document.getElementById("writer-placeholder"),

    // Controls
    speedSlider: document.getElementById("speed-slider"),
    speedValue: document.getElementById("speed-value"),
    strokeColor: document.getElementById("stroke-color"),
    radicalToggle: document.getElementById("highlight-radical"),

    // Actions
    replayBtn: document.getElementById("replay-btn"),
    exportBtn: document.getElementById("export-btn"),
  };

  // ──────────────────────────────────────────────
  // Utilities
  // ──────────────────────────────────────────────

  /** Matches common CJK Unified Ideographs. */
  var CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
  var CJK_RE_G = /[\u4e00-\u9fff\u3400-\u4dbf]/g;

  function showToast(message, durationMs) {
    var toast = document.querySelector(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("visible");
    setTimeout(function () {
      toast.classList.remove("visible");
    }, durationMs || 2000);
  }

  /** Extract the first CJK character from a string, or null. */
  function firstCJK(str) {
    var m = str.match(CJK_RE);
    return m ? m[0] : null;
  }

  // ──────────────────────────────────────────────
  // Pinyin Conversion
  // ──────────────────────────────────────────────

  function convertPinyin() {
    var text = dom.pinyinInput.value.trim();

    if (!text) {
      state.pinyinText = "";
      dom.pinyinOutput.innerHTML =
        '<span class="placeholder-text">Pinyin will appear here…</span>';
      dom.copyBtn.disabled = true;
      return;
    }

    if (!pinyinReady) {
      dom.pinyinOutput.innerHTML =
        '<span class="placeholder-text">pinyin-pro library failed to load. Check console.</span>';
      dom.copyBtn.disabled = true;
      return;
    }

    try {
      // pinyinPro.pinyin() returns lowercase, tone-marked, space-separated
      // syllables by default (toneType:"symbol", type:"string").
      var result = window.pinyinPro.pinyin(text, {
        toneType: "symbol",
        nonZh: "consecutive",
      });

      state.pinyinText = result;
      dom.pinyinOutput.textContent = result;
      dom.copyBtn.disabled = false;
    } catch (err) {
      console.error("Pinyin conversion error:", err);
      dom.pinyinOutput.innerHTML =
        '<span class="placeholder-text">Conversion failed — see console for details.</span>';
      dom.copyBtn.disabled = true;
    }
  }

  // ──────────────────────────────────────────────
  // Clipboard Copy
  // ──────────────────────────────────────────────

  function copyPinyin() {
    if (!state.pinyinText) return;

    // Modern API with fallback
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(state.pinyinText).catch(function () {
        fallbackCopy(state.pinyinText);
      });
    } else {
      fallbackCopy(state.pinyinText);
    }

    dom.copyBtn.classList.add("copied");
    dom.copyBtnText.textContent = "Copied!";
    setTimeout(function () {
      dom.copyBtn.classList.remove("copied");
      dom.copyBtnText.textContent = "Copy to Clipboard";
    }, 2000);
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }

  // ──────────────────────────────────────────────
  // HanziWriter — Stroke Order
  // ──────────────────────────────────────────────

  function destroyWriter() {
    if (state.writer) {
      state.writer = null;
    }
    dom.writerTarget.innerHTML = "";
  }

  /**
   * Validate input and show the stroke order for a single character.
   * Triggered by the "Show Strokes" button or Enter key.
   */
  function showStrokeOrder() {
    dom.strokeError.hidden = true;

    if (!hanziWriterReady) {
      dom.strokeError.textContent = "HanziWriter library failed to load.";
      dom.strokeError.hidden = false;
      return;
    }

    var raw = dom.strokeInput.value.trim();

    if (!raw) {
      dom.strokeError.textContent = "Please enter a Chinese character.";
      dom.strokeError.hidden = false;
      return;
    }

    var char = firstCJK(raw);

    if (!char) {
      dom.strokeError.textContent =
        "No valid Chinese character found. Please enter a Mandarin character (e.g. 你).";
      dom.strokeError.hidden = false;
      return;
    }

    // Warn if more than one character was entered
    var allCJK = raw.match(CJK_RE_G);
    if (allCJK && allCJK.length > 1) {
      dom.strokeError.textContent =
        'Multiple characters detected — showing first character "' + char + '" only.';
      dom.strokeError.hidden = false;
    }

    state.activeChar = char;
    createWriter(char);
  }

  /**
   * Create a HanziWriter instance for the given character using current
   * control values.  Uses the 'canvas' renderer so the <canvas> element
   * can be captured directly for video export.
   *
   * Ref: https://hanziwriter.org/docs.html
   */
  function createWriter(char) {
    destroyWriter();
    dom.writerPlaceholder.style.display = "none";

    state.writer = HanziWriter.create(dom.writerTarget, char, {
      width: state.writerSize,
      height: state.writerSize,
      padding: 12,
      renderer: "canvas",
      strokeAnimationSpeed: state.animationSpeed,
      delayBetweenStrokes: 250,
      strokeColor: state.strokeColor,
      radicalColor: state.highlightRadical
        ? state.radicalColor
        : null,
      outlineColor: "#ddd",
      drawingColor: state.strokeColor,
      showCharacter: true,
      showOutline: true,
      onLoadCharDataSuccess: function () {
        toggleStrokeButtons(true);
      },
      onLoadCharDataError: function (reason) {
        console.error("Failed to load character data:", reason);
        dom.writerPlaceholder.textContent =
          'Could not load data for "' + char + '". It may not be in the database.';
        dom.writerPlaceholder.style.display = "";
        toggleStrokeButtons(false);
      },
    });

    toggleStrokeButtons(true);
  }

  /** Recreate writer with current controls (size / color / speed changed). */
  function refreshWriter() {
    if (!state.activeChar) return;
    createWriter(state.activeChar);
  }

  function toggleStrokeButtons(enabled) {
    dom.replayBtn.disabled = !enabled;
    dom.exportBtn.disabled = !enabled;
  }

  // ──────────────────────────────────────────────
  // Video Export  (Mediabunny — standard MP4 via WebCodecs)
  // ──────────────────────────────────────────────
  /*
   * Strategy
   *   1. HanziWriter renders to a <canvas> (renderer:"canvas").
   *   2. An off-screen capture canvas is drawn with a white background
   *      and the current HanziWriter frame, scaled up to ≥640 px.
   *   3. Mediabunny's CanvasSource captures each frame, encodes it to
   *      H.264 via WebCodecs, and muxes it into a standard MP4 file
   *      identical in structure to YouTube downloads — plays natively
   *      in PowerPoint, Windows Media Player, QuickTime, and VLC.
   *
   * Mediabunny is the maintained successor to mp4-muxer and produces
   * properly structured MP4 containers with correct SPS/PPS handling.
   * It is loaded lazily from CDN on first export click.
   *
   * Browser requirements:
   *   - WebCodecs: Chrome 94+, Edge 94+, Safari 16.4+, Firefox 130+.
   */

  var mediabunnyModule = null;

  async function loadMediabunny() {
    if (mediabunnyModule) return mediabunnyModule;
    mediabunnyModule = await import(
      "https://cdn.jsdelivr.net/npm/mediabunny/+esm"
    );
    return mediabunnyModule;
  }

  function resetExportUI() {
    state.isRecording = false;
    dom.exportBtn.classList.remove("recording");
    dom.exportBtn.textContent = "⬇ Export as MP4";
    dom.exportBtn.disabled = false;
  }

  async function exportVideo() {
    if (!state.writer || state.isRecording) return;

    var canvas = dom.writerTarget.querySelector("canvas");
    if (!canvas) {
      showToast("No canvas found — show a character first.");
      return;
    }

    if (typeof VideoEncoder === "undefined") {
      showToast(
        "MP4 export requires a modern browser (Chrome 94+, Edge 94+, Safari 16.4+, or Firefox 130+)."
      );
      return;
    }

    state.isRecording = true;
    dom.exportBtn.classList.add("recording");
    dom.exportBtn.textContent = "● Preparing…";
    dom.exportBtn.disabled = true;

    try {
      var mb = await loadMediabunny();

      var FPS = 60;
      var frameDuration = 1 / FPS; // seconds

      // Upscale small canvases to ≥640 px, aligned to 16 (macroblock size)
      var exportSize = Math.max(canvas.width, 640);
      var w = Math.ceil(exportSize / 16) * 16;
      var h = w;

      // Off-screen capture canvas (upscaled, white background)
      var capCanvas = document.createElement("canvas");
      capCanvas.width = w;
      capCanvas.height = h;
      var capCtx = capCanvas.getContext("2d");

      // ── Mediabunny output ──
      var target = new mb.BufferTarget();
      var output = new mb.Output({
        format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
        target: target,
      });

      var videoSource = new mb.CanvasSource(capCanvas, {
        codec: "avc",
        bitrate: 4_000_000,
      });
      output.addVideoTrack(videoSource, { frameRate: FPS });

      await output.start();

      var recording = true;
      var lastCaptureTime = 0;
      var frameCount = 0;
      var minFrameGap = 1000 / FPS;

      function captureFrame(now) {
        if (!recording) return;

        if (now - lastCaptureTime < minFrameGap * 0.85) {
          requestAnimationFrame(captureFrame);
          return;
        }
        lastCaptureTime = now;

        capCtx.fillStyle = "#ffffff";
        capCtx.fillRect(0, 0, w, h);
        capCtx.drawImage(canvas, 0, 0, w, h);

        videoSource.add(frameCount * frameDuration, frameDuration);
        frameCount++;

        requestAnimationFrame(captureFrame);
      }

      dom.exportBtn.textContent = "● Recording…";
      requestAnimationFrame(captureFrame);

      state.writer.animateCharacter({
        onComplete: function () {
          setTimeout(async function () {
            recording = false;

            try {
              videoSource.close();
              await output.finalize();

              var buf = target.buffer;
              var blob = new Blob([buf], { type: "video/mp4" });
              var url = URL.createObjectURL(blob);

              var a = document.createElement("a");
              a.href = url;
              a.download =
                (state.activeChar || "character") + "_stroke_order.mp4";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              setTimeout(function () {
                URL.revokeObjectURL(url);
              }, 5000);

              showToast("MP4 downloaded!");
            } catch (err) {
              console.error("Export finalization failed:", err);
              showToast("Export failed — see console for details.");
            }

            resetExportUI();
          }, 600);
        },
      });
    } catch (err) {
      console.error("Export failed:", err);
      resetExportUI();
      showToast("Export failed: " + err.message);
    }
  }

  // ──────────────────────────────────────────────
  // Event Listeners
  // ──────────────────────────────────────────────

  function init() {
    // ── Pinyin: Convert button ──
    dom.pinyinConvertBtn.addEventListener("click", convertPinyin);

    // ── Pinyin: Enter key in textarea (without Shift) triggers convert ──
    dom.pinyinInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        convertPinyin();
      }
    });

    // ── Copy ──
    dom.copyBtn.addEventListener("click", copyPinyin);

    // ── Stroke: Show button ──
    dom.strokeShowBtn.addEventListener("click", showStrokeOrder);

    // ── Stroke: Enter key triggers show ──
    dom.strokeInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        showStrokeOrder();
      }
    });

    // ── Speed slider ──
    dom.speedSlider.addEventListener("input", function () {
      state.animationSpeed = parseFloat(dom.speedSlider.value);
      dom.speedValue.textContent = state.animationSpeed + "×";
      refreshWriter();
    });

    // ── Stroke colour ──
    dom.strokeColor.addEventListener("input", function () {
      state.strokeColor = dom.strokeColor.value;
      refreshWriter();
    });

    // ── Highlight radical ──
    dom.radicalToggle.addEventListener("change", function () {
      state.highlightRadical = dom.radicalToggle.checked;
      refreshWriter();
    });

    // ── Replay ──
    dom.replayBtn.addEventListener("click", function () {
      if (state.writer) {
        state.writer.animateCharacter();
      }
    });

    // ── Export ──
    dom.exportBtn.addEventListener("click", exportVideo);
  }

  init();
})();
