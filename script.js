// ===============================
//  GLOBAL
// ===============================
const allPlayers = [];
let globalVolume = 0.1;
let globalSpeed = 1;
let waveformObserver = null;

// Colori presi dal CSS (dopo che il DOM è pronto)
let wavePlayedColor = "#ffaa55";
let waveUnplayedColor = "#ff5500";

// Variabili di stato globali per i controlli
let currentIndex = -1;
let loopEnabled = false;

// ===============================
//  STOP ALL EXCEPT ONE
// ===============================
function stopAllExcept(currentAudio) {
    allPlayers.forEach(p => {
        if (p.audio !== currentAudio) {
            p.audio.pause();
            p.audio.currentTime = 0;
            p.draw(0);
            p.box.classList.remove("selected");
        }
    });
}

// ===============================
//  SET CURRENT TRACK
// ===============================
function setCurrentTrack(box) {
    const boxes = getPlayableBoxes();
    currentIndex = boxes.indexOf(box);

    document.querySelectorAll(".DemoBox").forEach(b => {
        b.classList.toggle("active-track", b === box);
    });
}

// ===============================
//  GET PLAYABLE BOXES
// ===============================
function getPlayableBoxes() {
    return [...document.querySelectorAll(".DemoBox")]
        .filter(b => b.dataset.file);
}

// ===============================
//  CREATE WAVEFORM
// ===============================
async function createWaveformForVisible(box, fileName) {
    const canvas = box.querySelector(".WaveCanvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    const url = "audio/" + fileName;

    const audio = new Audio(url);
    audio.volume = globalVolume;
    audio.playbackRate = globalSpeed;
    audio.preload = "metadata";

    audio.preservesPitch = false;
    if ('mozPreservesPitch' in audio) audio.mozPreservesPitch = false;
    if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = false;

    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await new (window.AudioContext || window.webkitAudioContext)()
            .decodeAudioData(arrayBuffer);

        const rawData = audioBuffer.getChannelData(0);
        const samples = 150;
        const blockSize = Math.floor(rawData.length / samples);
        const filteredData = [];

        for (let i = 0; i < samples; i++) {
            let sum = 0;
            for (let j = 0; j < blockSize; j++) {
                sum += Math.abs(rawData[i * blockSize + j]);
            }
            filteredData.push(sum / blockSize);
        }

        const maxVal = Math.max(...filteredData) || 1;
        const normalizedData = filteredData.map(n => n / maxVal);

        canvas.width = 600;
        canvas.height = 150;

        const middle = canvas.height / 2;
        const barWidth = canvas.width / samples;

        // WAVEFORM CORRETTA (gold solo per tracce gold)
        function drawWaveform(progress = 0) {
            ctx.fillStyle = "#050510";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const played = box.classList.contains("gold") ? "gold" : wavePlayedColor;
            const unplayed = box.classList.contains("gold") ? "#7a5a00" : waveUnplayedColor;

            normalizedData.forEach((val, i) => {
                const barHeight = val * (canvas.height / 2);
                const isPlayed = (i / samples) < progress;

                ctx.fillStyle = isPlayed ? played : unplayed;

                ctx.fillRect(i * barWidth, middle - barHeight, barWidth * 0.8, barHeight);
                ctx.fillRect(i * barWidth, middle, barWidth * 0.8, barHeight);
            });
        }

        const player = { audio, draw: drawWaveform, box };
        allPlayers.push(player);

        drawWaveform(0);

        // ====================== EVENTI ======================

        audio.addEventListener("play", () => {
            stopAllExcept(audio);
            box.classList.add("selected");
            setCurrentTrack(box);
        });

        audio.addEventListener("pause", () => {
            if (audio.currentTime < audio.duration - 0.1) {
                box.classList.remove("selected");
            }
        });

        audio.addEventListener("ended", () => {
            box.classList.remove("selected");
            drawWaveform(0);

            if (loopEnabled) {
                audio.currentTime = 0;
                audio.play();
            } else if (currentIndex < getPlayableBoxes().length - 1) {
                nextTrack();
            }
        });

        canvas.addEventListener("click", (e) => {
            const rect = canvas.getBoundingClientRect();
            const scale = canvas.width / rect.width;
            const realX = (e.clientX - rect.left) * scale;
            let percent = realX / canvas.width;
            percent = Math.max(0, Math.min(1, percent));

            audio.currentTime = percent * audio.duration;
            drawWaveform(percent);

            stopAllExcept(audio);
            audio.play();

            setCurrentTrack(box);

            const playBtn = document.getElementById("playBtn");
            if (playBtn) playBtn.textContent = "⏸";
        });

        audio.addEventListener("timeupdate", () => {
            const progress = audio.currentTime / audio.duration || 0;
            drawWaveform(progress);
        });

    } catch (err) {
        console.error("Errore nel caricamento di:", fileName, err);
        ctx.fillStyle = "#300";
        ctx.fillRect(0, 0, canvas.width || 600, canvas.height || 150);
    }
}

// ===============================
//  LOAD AUDIO LIST
// ===============================
async function loadAudio() {
    const res = await fetch("audioList.json");
    const files = await res.json();

    const container = document.getElementById("demos-container");
    if (!container) return;

    const audioExtensions = ["mp3", "wav", "ogg", "flac", "aiff", "m4a"];

    for (const item of files) {
        const ext = item.file.split(".").pop().toLowerCase();
        if (!audioExtensions.includes(ext)) continue;

        const filePath = "audio/" + item.file;
        const baseName = item.file.replace(/\.[^/.]+$/, "");

        let exists = true;
        try {
            const check = await fetch(filePath, { method: "HEAD" });
            if (!check.ok) exists = false;
        } catch {
            exists = false;
        }

        const box = document.createElement("div");
        box.className = "DemoBox";

        if (item.gold) {
            box.classList.add("gold");
        }

        if (!exists) {
            box.innerHTML = `
                <div class="DemoTitle">${baseName} 
                    <span style="color:#ff4444; font-weight:bold;">(taken)</span>
                </div>
                <div style="opacity:0.4; font-size:14px;">This demo is taken</div>
            `;
            container.appendChild(box);
            continue;
        }

        box.innerHTML = `
            <div class="DemoTitle">${baseName}</div>
            <canvas class="WaveCanvas"></canvas>
        `;
        box.dataset.file = item.file;

        container.appendChild(box);
    }

    waveformObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const box = entry.target;
                if (!box.dataset.waveformLoaded && box.dataset.file) {
                    box.dataset.waveformLoaded = "true";
                    createWaveformForVisible(box, box.dataset.file);
                }
            }
        });
    }, {
        rootMargin: "300px 0px",
        threshold: 0.1
    });

    document.querySelectorAll(".DemoBox").forEach(box => {
        if (box.dataset.file) waveformObserver.observe(box);
    });
}

// ===============================
//  PLAY INDEX
// ===============================
function playIndex(i) {
    const boxes = getPlayableBoxes();
    if (boxes.length === 0) return;

    if (i < 0) i = boxes.length - 1;
    if (i >= boxes.length) i = 0;

    currentIndex = i;
    const box = boxes[i];
    const player = allPlayers.find(p => p.box === box);

    if (!player) return;

    setCurrentTrack(box);

    stopAllExcept(player.audio);
    player.audio.currentTime = 0;
    player.audio.play();

    document.getElementById("playBtn").textContent = "⏸";
}

function playPause() {
    const boxes = getPlayableBoxes();
    if (boxes.length === 0) return;

    if (currentIndex === -1) currentIndex = 0;

    const box = boxes[currentIndex];
    const player = allPlayers.find(p => p.box === box);

    if (!player) return;

    if (player.audio.paused) {
        stopAllExcept(player.audio);
        player.audio.play();
        document.getElementById("playBtn").textContent = "⏸";
    } else {
        player.audio.pause();
        document.getElementById("playBtn").textContent = "▶️";
    }
}

function nextTrack() {
    playIndex(currentIndex + 1);
}

function prevTrack() {
    playIndex(currentIndex - 1);
}

function toggleLoop() {
    loopEnabled = !loopEnabled;

    const btn = document.getElementById("loopBtn");
    if (btn) btn.classList.toggle("active", loopEnabled);

    allPlayers.forEach(p => p.audio.loop = loopEnabled);
}

// ===============================
//  DOM CONTENT LOADED
// ===============================
window.addEventListener("DOMContentLoaded", () => {

    document.getElementById("playBtn").addEventListener("click", playPause);
    document.getElementById("nextBtn").addEventListener("click", nextTrack);
    document.getElementById("prevBtn").addEventListener("click", prevTrack);
    document.getElementById("loopBtn").addEventListener("click", toggleLoop);

    const rootStyles = getComputedStyle(document.documentElement);
    wavePlayedColor = rootStyles.getPropertyValue("--wave-played").trim() || "#ffaa55";
    waveUnplayedColor = rootStyles.getPropertyValue("--wave-unplayed").trim() || "#ff5500";

    loadAudio();

    // Global Volume
    const volInput = document.getElementById("globalVolume");
    const volLabel = document.getElementById("volLabel");
    if (volInput) {
        volInput.value = globalVolume;
        if (volLabel) volLabel.textContent = Math.round(globalVolume * 100) + "%";

        volInput.addEventListener("input", (e) => {
            globalVolume = parseFloat(e.target.value);
            if (volLabel) volLabel.textContent = Math.round(globalVolume * 100) + "%";
            allPlayers.forEach(p => p.audio.volume = globalVolume);
        });
    }

    // Global Speed
    const speedInput = document.getElementById("globalSpeed");
    const speedLabel = document.getElementById("speedLabel");
    if (speedInput) {
        speedInput.value = globalSpeed;
        if (speedLabel) speedLabel.textContent = Math.round(globalSpeed * 100) + "%";

        speedInput.addEventListener("input", (e) => {
            globalSpeed = parseFloat(e.target.value);
            if (speedLabel) speedLabel.textContent = Math.round(globalSpeed * 100) + "%";
            allPlayers.forEach(p => p.audio.playbackRate = globalSpeed);
        });
    }

    // Cent buttons
    document.querySelectorAll(".centBtn").forEach(btn => {
        btn.addEventListener("click", () => {
            const cent = parseInt(btn.dataset.cent);
            const rate = Math.pow(2, cent / 1200);

            globalSpeed = rate;
            if (speedInput) speedInput.value = rate;
            if (speedLabel) speedLabel.textContent = Math.round(rate * 100) + "%";

            allPlayers.forEach(p => p.audio.playbackRate = rate);
        });
    });
});
