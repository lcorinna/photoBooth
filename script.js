let stream, currentFacing = "user", zoom = 1;
let mode = "photo";
let mediaRecorder, recordedChunks = [];
let photoQueue = [];

const video = document.getElementById("video");
const preview = document.getElementById("preview");
const takePhotoBtn = document.getElementById("takePhoto");
const uploadAllBtn = document.getElementById("uploadAll");
const switchBtn = document.getElementById("switchCamera");
const toggleModeBtn = document.getElementById("toggleMode");
const startStopBtn = document.getElementById("startStopRecord");

function showToast(message) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.className = "fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-white text-black font-semibold px-4 py-2 rounded-xl shadow-lg opacity-90 z-50 text-sm animate-fade-in-out";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1500);
}

async function startCamera() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: currentFacing },
    audio: mode === "video"
  });
  video.srcObject = stream;
  video.muted = true;
}

switchBtn.onclick = () => {
  currentFacing = currentFacing === "user" ? "environment" : "user";
  startCamera();
};

toggleModeBtn.onclick = () => {
  mode = mode === "photo" ? "video" : "photo";
  startCamera();
  takePhotoBtn.classList.toggle("hidden", mode === "video");
  startStopBtn.classList.toggle("hidden", mode === "photo");
};

takePhotoBtn.onclick = () => {
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
};

startStopBtn.onclick = () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    startStopBtn.textContent = "⏺️ Запись";
  } else {
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream);
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
    };
    mediaRecorder.start();
    startStopBtn.textContent = "⏹️ Остановить";
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

document.getElementById("zoomIn").onclick = () => setZoom(zoom + 0.1);
document.getElementById("zoomOut").onclick = () => setZoom(Math.max(1, zoom - 0.1));

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

if (navigator.userAgent.includes("Telegram")) {
  showToast("⚠️ Камера может не работать во встроенном браузере Telegram. Откройте в Chrome или Safari.");
}
