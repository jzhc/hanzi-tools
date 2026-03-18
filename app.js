/* ==============================================================
   Hanzi Tools — Application Logic
   Pinyin conversion, stroke-order animation, and video export.
   ============================================================== */

(function () {
  "use strict";

  // ──────────────────────────────────────────────
  // State
  // ──────────────────────────────────────────────
  const state = {
    chars: [],          // CJK characters extracted from input
    currentIndex: 0,    // which character is shown in the animator
    writer: null,       // current HanziWriter instance
    pinyinText: "",     // latest pinyin string
    animationSpeed: 1,
    writerSize: 250,
    strokeColor: "#333333",
    highlightRadical: false,
    radicalColor: "#e74c3c",
    isRecording: false,
  };

  // ──────────────────────────────────────────────
  // DOM references
  // ──────────────────────────────────────────────
  const dom = {
    input: document.getElementById("hanzi-input"),
    pinyinOutput: document.getElementById("pinyin-output"),
    copyBtn: document.getElementById("copy-btn"),
    copyBtnText: document.getElementById("copy-btn-text"),
    prevBtn: document.getElementById("prev-char"),
    nextBtn: document.getElementById("next-char"),
    charIndicator: document.getElementById("char-indicator"),
    writerTarget: document.getElementById("hanzi-writer-target"),
    writerPlaceholder: document.getElementById("writer-placeholder"),
    speedSlider: document.getElementById("speed-slider"),
    speedValue: document.getElementById("speed-value"),
    sizeSlider: document.getElementById("size-slider"),
    sizeValue: document.getElementById("size-value"),
    strokeColor: document.getElementById("stroke-color"),
    radicalToggle: document.getElementById("highlight-radical"),
    replayBtn: document.getElementById("replay-btn"),
    exportBtn: document.getElementById("export-btn"),
  };

  // ──────────────────────────────────────────────
  // Utilities
  // ──────────────────────────────────────────────

  /** Matches CJK Unified Ideographs (covers the vast majority of Hanzi). */
  const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/g;

  /** Simple debounce helper. */
  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /** Show a brief toast notification at the bottom of the viewport. */
  function showToast(message, durationMs) {
    let toast = document.querySelector(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("visible");
    setTimeout(() => toast.classList.remove("visible"), durationMs || 2000);
  }

  // ──────────────────────────────────────────────
  // Pinyin Conversion
  // ──────────────────────────────────────────────

  function updatePinyin(text) {
    if (!text.trim()) {
      state.pinyinText = "";
      dom.pinyinOutput.innerHTML =
        '<span class="placeholder-text">Pinyin will appear here…</span>';
      dom.copyBtn.disabled = true;
      return;
    }

    try {
      /*
       * pinyinPro.pinyin() defaults:
       *   - toneType: "symbol" (diacritics)
       *   - type: "string" (space-separated)
       * This gives us lowercase + tonal marks + single space between syllables.
       */
      const result = window.pinyinPro.pinyin(text, {
        toneType: "symbol",
        nonZh: "consecutive",
      });
      state.pinyinText = result;
      dom.pinyinOutput.textContent = result;
      dom.copyBtn.disabled = false;
    } catch (err) {
      console.error("Pinyin conversion error:", err);
      dom.pinyinOutput.innerHTML =
        '<span class="placeholder-text">Could not convert — is pinyin-pro loaded?</span>';
      dom.copyBtn.disabled = true;
    }
  }

  // ──────────────────────────────────────────────
  // HanziWriter Management
  // ──────────────────────────────────────────────

  /** Destroy the current writer and clear the container. */
  function destroyWriter() {
    if (state.writer) {
      // HanziWriter does not expose a destroy method — clearing the
      // container's innerHTML effectively removes the SVG and detaches events.
      state.writer = null;
    }
    dom.writerTarget.innerHTML = "";
  }

  /** Create a fresh HanziWriter instance for the character at state.currentIndex. */
  function createWriter() {
    destroyWriter();

    if (state.chars.length === 0) {
      dom.writerPlaceholder.style.display = "";
      toggleStrokeButtons(false);
      return;
    }

    dom.writerPlaceholder.style.display = "none";

    const char = state.chars[state.currentIndex];
    try {
      state.writer = HanziWriter.create(dom.writerTarget, char, {
        width: state.writerSize,
        height: state.writerSize,
        padding: 12,
        strokeAnimationSpeed: state.animationSpeed,
        delayBetweenStrokes: 250,
        strokeColor: state.strokeColor,
        radicalColor: state.highlightRadical
          ? state.radicalColor
          : state.strokeColor,
        outlineColor: "#ddd",
        drawingColor: state.strokeColor,
        showCharacter: true,
        showOutline: true,
      });
    } catch (err) {
      console.error("HanziWriter creation error:", err);
      dom.writerPlaceholder.textContent =
        "Unable to load character "" + char + """;
      dom.writerPlaceholder.style.display = "";
    }

    toggleStrokeButtons(true);
    updateCharIndicator();
  }

  /** Enable or disable stroke-section buttons. */
  function toggleStrokeButtons(enabled) {
    dom.replayBtn.disabled = !enabled;
    dom.exportBtn.disabled = !enabled;
    dom.prevBtn.disabled = !enabled || state.currentIndex <= 0;
    dom.nextBtn.disabled =
      !enabled || state.currentIndex >= state.chars.length - 1;
  }

  /** Update the "2 / 5" indicator between prev/next buttons. */
  function updateCharIndicator() {
    if (state.chars.length === 0) {
      dom.charIndicator.textContent = "—";
      return;
    }
    const char = state.chars[state.currentIndex];
    dom.charIndicator.textContent =
      char + "  " + (state.currentIndex + 1) + " / " + state.chars.length;
  }

  // ──────────────────────────────────────────────
  // Input Handling
  // ──────────────────────────────────────────────

  function handleInputChange() {
    const text = dom.input.value;

    // Pinyin
    updatePinyin(text);

    // Extract CJK characters
    const matches = text.match(CJK_RE);
    const newChars = matches ? [...new Set(matches)] : [];

    // Preserve current index when possible, else reset
    const prevChar =
      state.chars.length > 0 ? state.chars[state.currentIndex] : null;
    state.chars = newChars;

    if (prevChar && newChars.includes(prevChar)) {
      state.currentIndex = newChars.indexOf(prevChar);
    } else {
      state.currentIndex = 0;
    }

    createWriter();
  }

  // ──────────────────────────────────────────────
  // Clipboard Copy
  // ──────────────────────────────────────────────

  async function copyPinyin() {
    if (!state.pinyinText) return;

    try {
      await navigator.clipboard.writeText(state.pinyinText);
    } catch {
      // Fallback for older browsers / insecure contexts
      const ta = document.createElement("textarea");
      ta.value = state.pinyinText;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }

    // Visual feedback
    dom.copyBtn.classList.add("copied");
    dom.copyBtnText.textContent = "Copied!";
    setTimeout(() => {
      dom.copyBtn.classList.remove("copied");
      dom.copyBtnText.textContent = "Copy to Clipboard";
    }, 2000);
  }

  // ──────────────────────────────────────────────
  // Video Export
  // ──────────────────────────────────────────────
  /*
   * Strategy:
   *   1. HanziWriter renders into SVG (its default renderer).
   *   2. We serialise the live SVG each frame and draw it onto a hidden
   *      <canvas> via an Image + Blob URL.
   *   3. The canvas stream is captured with MediaRecorder → produces a .webm.
   *   4. Ideally we'd transcode to MP4 with ffmpeg.wasm, but bootstrapping
   *      ffmpeg.wasm from a CDN in a strictly static page adds significant
   *      complexity (SharedArrayBuffer + COOP/COEP headers that GitHub Pages
   *      does not set by default). We therefore export as .webm and note the
   *      ffmpeg.wasm path in a comment below.
   *
   * ── ffmpeg.wasm upgrade path (for future reference) ──
   *   import { FFmpeg } from "@ffmpeg/ffmpeg";        // via CDN ESM
   *   import { fetchFile } from "@ffmpeg/util";
   *   const ffmpeg = new FFmpeg();
   *   await ffmpeg.load();
   *   ffmpeg.writeFile("input.webm", await fetchFile(webmBlob));
   *   await ffmpeg.exec(["-i", "input.webm", "output.mp4"]);
   *   const mp4 = await ffmpeg.readFile("output.mp4");
   *   // … trigger download of mp4 Blob …
   *
   *   Requirements:
   *     - Page must be served with Cross-Origin-Isolation headers
   *       (Cross-Origin-Opener-Policy: same-origin,
   *        Cross-Origin-Embedder-Policy: require-corp)
   *     - Or use a service-worker shim such as coi-serviceworker.
   */

  async function exportVideo() {
    if (!state.writer || state.isRecording) return;

    const svgEl = dom.writerTarget.querySelector("svg");
    if (!svgEl) {
      showToast("No character to export.");
      return;
    }

    // Guard: check browser support
    if (
      typeof HTMLCanvasElement.prototype.captureStream !== "function" ||
      typeof MediaRecorder === "undefined"
    ) {
      showToast("Your browser does not support video recording.");
      return;
    }

    state.isRecording = true;
    dom.exportBtn.classList.add("recording");
    dom.exportBtn.textContent = "● Recording…";
    dom.exportBtn.disabled = true;

    const size = state.writerSize;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    // Choose a supported MIME type
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        state.chars[state.currentIndex] + "_stroke_order.webm";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      state.isRecording = false;
      dom.exportBtn.classList.remove("recording");
      dom.exportBtn.textContent = "⬇ Export as Video";
      dom.exportBtn.disabled = false;
      showToast("Video downloaded!");
    };

    // ── Render loop: SVG → canvas each frame ──
    let recording = true;

    function renderFrame() {
      if (!recording) return;

      const svgClone = svgEl.cloneNode(true);
      // Ensure the SVG carries explicit dimensions for the rasteriser
      svgClone.setAttribute("width", size);
      svgClone.setAttribute("height", size);

      const data = new XMLSerializer().serializeToString(svgClone);
      const blob = new Blob([data], {
        type: "image/svg+xml;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        URL.revokeObjectURL(url);
        if (recording) requestAnimationFrame(renderFrame);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        if (recording) requestAnimationFrame(renderFrame);
      };

      img.src = url;
    }

    // Paint one blank white frame so captureStream has data before animation starts
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    recorder.start();
    requestAnimationFrame(renderFrame);

    // Trigger the stroke animation
    state.writer.animateCharacter({
      onComplete: () => {
        // Short delay to capture the final still frame
        setTimeout(() => {
          recording = false;
          recorder.stop();
        }, 600);
      },
    });
  }

  // ──────────────────────────────────────────────
  // Event Listeners
  // ──────────────────────────────────────────────

  function init() {
    // ── Input ──
    dom.input.addEventListener("input", debounce(handleInputChange, 250));

    // ── Copy ──
    dom.copyBtn.addEventListener("click", copyPinyin);

    // ── Character navigation ──
    dom.prevBtn.addEventListener("click", () => {
      if (state.currentIndex > 0) {
        state.currentIndex--;
        createWriter();
      }
    });

    dom.nextBtn.addEventListener("click", () => {
      if (state.currentIndex < state.chars.length - 1) {
        state.currentIndex++;
        createWriter();
      }
    });

    // ── Speed slider ──
    dom.speedSlider.addEventListener("input", () => {
      state.animationSpeed = parseFloat(dom.speedSlider.value);
      dom.speedValue.textContent = state.animationSpeed + "×";
      // Speed is baked into the HanziWriter constructor, so we recreate
      createWriter();
    });

    // ── Size slider ──
    dom.sizeSlider.addEventListener("input", () => {
      state.writerSize = parseInt(dom.sizeSlider.value, 10);
      dom.sizeValue.textContent = state.writerSize + " px";
      createWriter();
    });

    // ── Stroke colour ──
    dom.strokeColor.addEventListener("input", () => {
      state.strokeColor = dom.strokeColor.value;
      createWriter();
    });

    // ── Highlight radical toggle ──
    dom.radicalToggle.addEventListener("change", () => {
      state.highlightRadical = dom.radicalToggle.checked;
      createWriter();
    });

    // ── Replay animation ──
    dom.replayBtn.addEventListener("click", () => {
      if (state.writer) {
        state.writer.animateCharacter();
      }
    });

    // ── Export video ──
    dom.exportBtn.addEventListener("click", exportVideo);
  }

  init();
})();
