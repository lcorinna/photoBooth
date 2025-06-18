let stream, currentFacing = "user", zoom = 1;
let mode = "photo";
let mediaRecorder, recordedChunks = [];
let photoQueue = [];
let isRecording = false;
let isFlashOn = false;
let hasShownVideoTip = false;
let videoTrack = null;

const video = document.getElementById("video");
const preview = document.getElementById("preview");

const modeToggleBtn = document.getElementById("modeToggle");
const mainActionBtn = document.getElementById("mainAction");
const switchBtn = document.getElementById("switchCamera");
const toggleFlashBtn = document.getElementById("toggleFlash");
const zoomInBtn = document.getElementById("zoomIn");
const zoomOutBtn = document.getElementById("zoomOut");
const uploadAllBtn = document.getElementById("uploadAll");

function showToast(message) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.className = "fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-white text-black font-semibold px-4 py-2 rounded-xl shadow-lg opacity-90 z-50 text-sm animate-fade-in-out";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

async function startCamera() {
  if (stream) stream.getTracks().forEach(t => t.stop());

  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: currentFacing },
    audio: mode === "video"
  });

  video.srcObject = stream;
  video.muted = true;

  videoTrack = stream.getVideoTracks()[0];
  isFlashOn = false;

  video.classList.toggle("mirror", currentFacing === "user");

  updateActionUI();
}

function updateActionUI() {
  modeToggleBtn.textContent = mode === "photo" ? "🎥 Видео режим" : "📷 Фото режим";
  mainActionBtn.textContent = mode === "photo"
    ? "📸 Сделать фото"
    : isRecording
      ? "⏹️ Остановить запись"
      : "⏺️ Начать запись";
}

modeToggleBtn.onclick = () => {
  if (isRecording) return;
  mode = mode === "photo" ? "video" : "photo";
  startCamera();

  if (mode === "video" && !hasShownVideoTip) {
    showToast("⏱ Видео должно быть не длиннее 60 секунд");
    hasShownVideoTip = true;
  }
};

mainActionBtn.onclick = () => {
  if (mode === "photo") {
    takePhoto();
  } else {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }
};

function takePhoto() {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  const dataURL = canvas.toDataURL("image/jpeg", 1.0);

  const wrapper = document.createElement("div");
  wrapper.className = "preview-item";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "preview-checkbox";
  checkbox.checked = true;

  const img = document.createElement("img");
  img.src = dataURL;

  wrapper.appendChild(checkbox);
  wrapper.appendChild(img);
  preview.appendChild(wrapper);

  photoQueue.push({ data: dataURL, type: "photo", checkbox });
}

function startRecording() {
  recordedChunks = [];

  try {
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp8,opus"
    });
  } catch (e) {
    showToast("❌ Ваш браузер не поддерживает запись видео");
    return;
  }

  mediaRecorder.ondataavailable = e => recordedChunks.push(e.data);
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: "video/webm" });

    const wrapper = document.createElement("div");
    wrapper.className = "preview-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "preview-checkbox";
    checkbox.checked = true;

    const videoEl = document.createElement("video");
    videoEl.src = URL.createObjectURL(blob);
    videoEl.controls = true;
    videoEl.className = "rounded-xl";

    wrapper.appendChild(checkbox);
    wrapper.appendChild(videoEl);
    preview.appendChild(wrapper);

    photoQueue.push({ blob, type: "video", checkbox });

    if (blob.size > 95 * 1024 * 1024) {
      showToast("⚠️ Видео может быть слишком большим для загрузки");
    }

    switchBtn.disabled = false;
    modeToggleBtn.disabled = false;
  };

  mediaRecorder.start();
  isRecording = true;
  updateActionUI();

  // 🔒 Блокируем кнопки на время записи
  switchBtn.disabled = true;
  modeToggleBtn.disabled = true;
}

function stopRecording() {
  mediaRecorder.stop();
  isRecording = false;
  updateActionUI();
}

switchBtn.onclick = () => {
  if (isRecording) return;
  currentFacing = currentFacing === "user" ? "environment" : "user";
  startCamera();
};

toggleFlashBtn.onclick = async () => {
  if (!videoTrack) return showToast("❗ Камера неактивна");

  const capabilities = videoTrack.getCapabilities();
  if (!capabilities.torch) {
    showToast("⚠️ Вспышка не поддерживается");
    return;
  }

  try {
    isFlashOn = !isFlashOn;
    await videoTrack.applyConstraints({ advanced: [{ torch: isFlashOn }] });
    showToast(isFlashOn ? "💡 Вспышка включена" : "🔕 Вспышка выключена");
  } catch (err) {
    console.error("⚠️ Ошибка включения вспышки:", err);
    showToast("❌ Не удалось переключить вспышку");
  }
};

uploadAllBtn.onclick = async () => {
  const toUpload = photoQueue.filter(p => p.checkbox.checked);
  if (toUpload.length === 0) {
    showToast("❗ Отметьте хотя бы одно фото или видео");
    return;
  }

  for (const item of toUpload) {
    if (item.type === "photo") {
      await fetch("/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: item.data, type: item.type })
      });
    } else if (item.type === "video") {
      const formData = new FormData();
      const filename = `video_${Date.now()}.webm`;
      formData.append("file", item.blob, filename);

      await fetch("/upload-video", {
        method: "POST",
        body: formData
      });
    }
  }

  showToast("🎉 Загрузка завершена!");
  photoQueue = [];
  preview.innerHTML = "";
};

zoomInBtn.onclick = () => setZoom(zoom + 0.1);
zoomOutBtn.onclick = () => setZoom(Math.max(1, zoom - 0.1));

function setZoom(value) {
  zoom = value;
  if (video.srcObject) {
    const track = video.srcObject.getVideoTracks()[0];
    const capabilities = track.getCapabilities();
    if (capabilities.zoom) {
      track.applyConstraints({ advanced: [{ zoom }] });
    } else {
      video.style.transform = `scale(${zoom})`;
    }
  }
}

startCamera();
