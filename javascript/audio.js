const audioFolderDir = "./audio/";

const audioFiles = [
    "Cassette.mp3",
    "Click.mp3",
    "Erase.mp3",
    "UIGeneralCancel.mp3",
    "UIGeneralFocus.mp3",
    "UIGeneralOK.mp3",
    "UIPipboyOK.mp3",
    "UIPipboyOKPress.mp3",
    "UISelectOff.mp3",
    "UISelectOn.mp3"
]

const audioCache = {};

// preload audio
audioFiles.forEach(file => {
    const link = audioFolderDir + file;
    const audio = new Audio();
    audio.src = link;
    audio.preload = 'auto';
    audio.load();
    audioCache[file] = audio;
})

export function playAudio(link) {
    if (!link || isMobile()) return;

    audioCache[link].currentTime = 0; //such that machine gun sfx
    audioCache[link].play();
}

// no sound for mobile; they cannot handle it
function isMobile() {
    return /Android|iPhone/i.test(navigator.userAgent);
}