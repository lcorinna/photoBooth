package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

type UploadRequest struct {
	Data string `json:"data"`
	Type string `json:"type"` // должен быть "photo"
}

// Обработка фото (base64)
func uploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Только POST", http.StatusMethodNotAllowed)
		log.Println("❌ Метод не POST")
		return
	}

	var req UploadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Ошибка чтения JSON", http.StatusBadRequest)
		log.Println("❌ Ошибка чтения JSON:", err)
		return
	}

	if req.Type != "photo" {
		http.Error(w, "Неподдерживаемый тип данных", http.StatusBadRequest)
		log.Println("❌ Неверный тип в uploadHandler:", req.Type)
		return
	}

	base64Data := req.Data
	if idx := strings.Index(base64Data, ","); idx != -1 {
		base64Data = base64Data[idx+1:]
	}

	dataBytes, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		http.Error(w, "Ошибка декодирования", http.StatusBadRequest)
		log.Println("❌ Ошибка декодирования:", err)
		return
	}

	if err := os.MkdirAll("photos", os.ModePerm); err != nil {
		log.Println("❌ Не удалось создать папку photos:", err)
	}

	filename := fmt.Sprintf("photo_%s.jpg", time.Now().Format("20060102_150405"))
	path := "photos/" + filename

	err = ioutil.WriteFile(path, dataBytes, 0644)
	if err != nil {
		http.Error(w, "Ошибка сохранения", http.StatusInternalServerError)
		log.Println("❌ Ошибка записи файла:", err)
		return
	}

	log.Println("✅ Фото сохранено:", path)
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"photo saved"}`))
}

// Обработка оригинального видео-файла (FormData)
func uploadVideoHandler(w http.ResponseWriter, r *http.Request) {
	err := r.ParseMultipartForm(100 << 20) // до 100MB
	if err != nil {
		http.Error(w, "Ошибка разбора формы", http.StatusBadRequest)
		log.Println("❌ ParseMultipartForm:", err)
		return
	}

	file, handler, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Файл не найден", http.StatusBadRequest)
		log.Println("❌ FormFile:", err)
		return
	}
	defer file.Close()

	if err := os.MkdirAll("photos", os.ModePerm); err != nil {
		log.Println("❌ mkdir:", err)
	}

	// Уникальное имя
	filename := fmt.Sprintf("video_%d_%s", time.Now().UnixNano(), handler.Filename)
	path := "photos/" + filename

	out, err := os.Create(path)
	if err != nil {
		http.Error(w, "Ошибка создания файла", http.StatusInternalServerError)
		log.Println("❌ os.Create:", err)
		return
	}
	defer out.Close()

	_, err = io.Copy(out, file)
	if err != nil {
		http.Error(w, "Ошибка записи файла", http.StatusInternalServerError)
		log.Println("❌ io.Copy:", err)
		return
	}

	log.Println("✅ Видео сохранено:", path)
	w.Write([]byte(`{"status":"video saved"}`))
}

// Возвращает список файлов из /photos/
func listPhotosHandler(w http.ResponseWriter, r *http.Request) {
	files, err := os.ReadDir("photos")
	if err != nil {
		http.Error(w, "Ошибка чтения папки", http.StatusInternalServerError)
		log.Println("❌ Ошибка чтения папки photos:", err)
		return
	}

	var media []string
	for _, f := range files {
		if !f.IsDir() && (strings.HasSuffix(f.Name(), ".jpg") ||
			strings.HasSuffix(f.Name(), ".jpeg") ||
			strings.HasSuffix(f.Name(), ".png") ||
			strings.HasSuffix(f.Name(), ".webp") ||
			strings.HasSuffix(f.Name(), ".webm")) {
			media = append(media, "/photos/"+f.Name())
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(media)
}

// Главный вход
func main() {
	http.HandleFunc("/upload", uploadHandler)
	http.HandleFunc("/upload-video", uploadVideoHandler)
	http.HandleFunc("/photos/list", listPhotosHandler)

	// Статические файлы
	http.Handle("/", http.FileServer(http.Dir(".")))
	http.Handle("/photos/", http.StripPrefix("/photos/", http.FileServer(http.Dir("./photos"))))

	fmt.Println("Сервер запущен на http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
