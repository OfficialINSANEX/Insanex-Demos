// ===============================
//  GLOBAL
// ===============================
const allPlayers = [];
let globalVolume = 0.1;
let globalSpeed = 1;
let waveformObserver = null;

let wavePlayedColor = "#ffaa55";
let waveUnplayedColor = "#ff5500";

let currentIndex = -1;
let loopEnabled = false;

const VIEW_API = "https://viewscounter.phonckmusic.workers.dev";
const REACT_API = VIEW_API + "/react";


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
    return [...document.querySelectorAll(".DemoBox")].filter(b => b.dataset.file);
}


// ===============================
//  LOAD INITIAL VIEWS
// ===============================
async function loadInitialViews(box) {
    const fileName = box.dataset.file;
    if (!fileName) return;

    try {
        const res = await fetch(`${VIEW_API}/getView?track=${encodeURIComponent(fileName)}`);
        if (!res.ok) return;

        const data = await res.json();
        const viewEl = box.querySelector(".viewCounter");
        if (viewEl) {
            viewEl.textContent = `views: ${data.views || 0}`;
        }
    } catch (err) {
        console.warn("Impossibile caricare views per:", fileName, err);
    }
}


// ===============================
//  REACTIONS — LOCAL STORAGE
// ===============================
function getLocalReaction(track) {
    return localStorage.getItem("reaction_" + track) || null;
}

function setLocalReaction(track, reaction) {
    if (!reaction) localStorage.removeItem("reaction_" + track);
    else localStorage.setItem("reaction_" + track, reaction);
}


// ===============================
//  REACTIONS — UI UPDATE
// ===============================
function updateReactionUI(box, reaction) {
    box.querySelectorAll(".reactIcon").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.react === reaction);
    });
}


// ===============================
//  REACTIONS — LOAD FROM SERVER
// ===============================
async function loadReactions(box) {
    const track = box.dataset.file;
    if (!track) return;

    try {
        const res = await fetch(`${REACT_API}?track=${encodeURIComponent(track)}`);
        if (!res.ok) return;

        const data = await res.json();

        box.querySelector('.reactCount[data-react="like"]').textContent = data.like || 0;
        box.querySelector('.reactCount[data-react="fire"]').textContent = data.fire || 0;
        box.querySelector('.reactCount[data-react="dislike"]').textContent = data.dislike || 0;

        updateReactionUI(box, getLocalReaction(track));

    } catch (err) {
        console.warn("Errore caricamento reazioni per:", track, err);
    }
}


// ===============================
//  REACTIONS — SEND TO SERVER
// ===============================
async function sendReaction(track, reaction) {
    try {
        const res = await fetch(REACT_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ track, reaction })
        });

        if (!res.ok) return;

        const data = await res.json();

        const box = document.querySelector(`.DemoBox[data-file="${track}"]`);
        if (box) {
            box.querySelector('.reactCount[data-react="like"]').textContent = data.like;
            box.querySelector('.reactCount[data-react="fire"]').textContent = data.fire;
            box.querySelector('.reactCount[data-react="dislike"]').textContent = data.dislike;
        }

    } catch (err) {
        console.warn("Errore invio reazione:", err);
    }
}


// ===============================
//  REACTIONS — ENABLE FOR BOX
// ===============================
function enableReactionsForBox(box) {
    const track = box.dataset.file;
    if (!track) return;

    box.querySelectorAll(".reactIcon").forEach(btn => {
        btn.addEventListener("click", () => {
            const chosen = btn.dataset.react;
            const current = getLocalReaction(track);

            let newReaction = chosen;
            if (current === chosen) newReaction = null;

            setLocalReaction(track, newReaction);
            updateReactionUI(box, newReaction);
            sendReaction(track, newReaction);
        });
    });
}


// ===============================
//  CREATE WAVEFORM
// ===============================
async function createWaveformForVisible(box) {
    const fileName = box.dataset.file;
    const canvas = box.querySelector(".WaveCanvas");
    if (!canvas || !fileName) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    const url = "audio/" + fileName;

    const audio = new Audio(url);
    audio.volume = globalVolume;
    audio.playbackRate = globalSpeed;
    audio.preload = "metadata";

    audio.preservesPitch = false;
    if ("mozPreservesPitch" in audio) audio.mozPreservesPitch = false;
    if ("webkitPreservesPitch" in audio) audio.webkitPreservesPitch = false;

    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await new (window.AudioContext || window.webkitAudioContext)()
            .decodeAudioData(arrayBuffer);

        const rawData = audioBuffer.getChannelData(0);
        const samples = 200;
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

        function drawWaveform(progress = 0) {
            ctx.fillStyle = "#050510";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const isDiamond = box.classList.contains("diamond");
            const isGold = box.classList.contains("gold");

            const played = isDiamond ? "#00eaff" : isGold ? "gold" : wavePlayedColor;
            const unplayed = isDiamond ? "#006b80" : isGold ? "#7a5a00" : waveUnplayedColor;

            normalizedData.forEach((val, i) => {
                const barHeight = val * (canvas.height / 2);
                const isPlayed = (i / samples) < progress;

                ctx.fillStyle = isPlayed ? played : unplayed;

                ctx.fillRect(i * barWidth, middle - barHeight, barWidth * 0.8, barHeight);
                ctx.fillRect(i * barWidth, middle, barWidth * 0.8, barHeight);
            });
        }

        const player = { audio, draw: drawWaveform, box, hasCountedView: false };
        allPlayers.push(player);

        drawWaveform(0);

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

            player.hasCountedView = true;

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

            if (!player.hasCountedView && audio.currentTime > 2.5) {
                player.hasCountedView = true;

                fetch(`${VIEW_API}/addView?track=${encodeURIComponent(box.dataset.file)}`)
                    .then(r => r.json())
                    .then(data => {
                        const viewEl = box.querySelector(".viewCounter");
                        if (viewEl) viewEl.textContent = `views: ${data.views}`;
                    })
                    .catch(err => console.warn("Errore aggiornamento views:", err));
            }
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

        if (item.gold) box.classList.add("gold");
        if (item.diamond) box.classList.add("diamond"); // <— FIX

        if (!exists) {
            box.classList.add("taken");
            box.innerHTML = `
                <div class="DemoTitle">${baseName} 
                    <span class="takenLabel">(taken)</span>
                </div>
                <div class="takenSub">This demo is taken</div>
            `;
            container.appendChild(box);
            continue;
        }

        box.innerHTML = `
            <div class="DemoHeader">
                <div class="DemoTitle">${baseName}</div>

                <div class="ReactionTopRight">
                    <span class="reactIcon" data-react="dislike">👎 <span class="reactCount" data-react="dislike">0</span></span>
                    <span class="reactIcon" data-react="like">👍 <span class="reactCount" data-react="like">0</span></span>
                    <span class="reactIcon" data-react="fire">🔥 <span class="reactCount" data-react="fire">0</span></span>
                </div>
            </div>

            <div class="viewCounter">views: 0</div>
            <canvas class="WaveCanvas"></canvas>
        `;

        box.dataset.file = item.file;

        container.appendChild(box);

        enableReactionsForBox(box);
        loadReactions(box);
    }

    waveformObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const box = entry.target;
                if (!box.dataset.waveformLoaded && box.dataset.file) {
                    box.dataset.waveformLoaded = "true";

                    createWaveformForVisible(box);
                    loadInitialViews(box);
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


// ====================== PLAYER CONTROLS ======================
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
    const playBtn = document.getElementById("playBtn");
    const nextBtn = document.getElementById("nextBtn");
    const prevBtn = document.getElementById("prevBtn");
    const loopBtn = document.getElementById("loopBtn");

    if (playBtn) playBtn.addEventListener("click", playPause);
    if (nextBtn) nextBtn.addEventListener("click", nextTrack);
    if (prevBtn) prevBtn.addEventListener("click", prevTrack);
    if (loopBtn) loopBtn.addEventListener("click", toggleLoop);

    const rootStyles = getComputedStyle(document.documentElement);
    wavePlayedColor = rootStyles.getPropertyValue("--wave-played").trim() || "#ffaa55";
    waveUnplayedColor = rootStyles.getPropertyValue("--wave-unplayed").trim() || "#ff5500";

    loadAudio();

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

    const popup = document.getElementById("insanexPopupOverlay");
    const popupBtn = document.getElementById("insanexPopupBtn");
    if (popup && popupBtn) {
        popupBtn.addEventListener("click", () => {
            popup.style.display = "none";
        });
    }
});
