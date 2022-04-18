const { ipcRenderer } = require("electron");

const ytpl = require('ytpl');
const ytdl = require("ytdl-core")
const ytsr = require("ytsr")
const fs = require("fs")
const path = require("path")

const download_location = path.resolve(path.join(process.env.HOME, "Music", "Downloads"))
const downloads_csv_loc = path.resolve(path.join(download_location, "Downloads.csv"))

if(!fs.existsSync(download_location)) fs.mkdirSync(download_location)
if(!fs.existsSync(downloads_csv_loc)) fs.writeFileSync(downloads_csv_loc, "")

let playlist = []
let currentTrack = -1



function get_download_info(video_url) {
  let downloads = get_downloads_csv()
  for(let info of downloads) {
    let _video_url = info[0]

    let video_id = ytdl.getVideoID(video_url)
    let _video_id = ytdl.getVideoID(_video_url)

    if(_video_id === video_id) return info;
  }
  return null;
}

function unpack_csv(loc_of_csv) {
  let data = fs.readFileSync(loc_of_csv, {encoding: "utf8", flag: "r"})
  let unpacked = data.split("\n").filter(_ => _).map(_ => _.split(","));

  return unpacked;
}

function get_downloads_csv() {
  // Return downloads infos
  return unpack_csv(downloads_csv_loc);
}

async function download_music(url) {
  let info = await ytdl.getInfo(url);
  let title = info.videoDetails.title;
  let formats = info.formats;
  let thumb = info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1]
  try {
    let best_audio = ytdl.chooseFormat(formats, {quality: "highestaudio", filter: "audioonly"});
    let content_length = parseInt(best_audio.contentLength)
    let valid_file_name = `${title.replace(/[/\\?%*:|"<>]/g, '-')}.${best_audio.container}`;
    let output = path.resolve(path.join(download_location, valid_file_name));
    let from_stream = ytdl.downloadFromInfo(info, {format: best_audio})
    let to_stream = fs.createWriteStream(output);
    
    to_stream.addListener("close", () => {
      from_stream.destroy()
    });

    let written = 0;
    let event_el = document.createElement("div")

    from_stream.on("data", data => {
      to_stream.write(data, () => {
        written += data.length

        // Once the file has been downloaded completely, close the stream
        if(written/content_length === 1) {
          let video_data_csv = [url, thumb.url, title, output];

          fs.appendFileSync(downloads_csv_loc, video_data_csv.join(",") + "\n");
          to_stream.close()
        }

        let progress_event = new CustomEvent("progress", {detail: {progress: written/content_length, write_stream: to_stream}})
        event_el.dispatchEvent(progress_event)
      })
    })

    return [event_el, to_stream];
  } catch(error) {
    console.error(error);
    throw error;
  }
}

function validate_downloads_csv() {
  let downloads = get_downloads_csv()
  let unique_downloads = downloads.filter((object,index) => index === downloads.findIndex(obj => JSON.stringify(obj) === JSON.stringify(object)));

  // Clear downloads csv
  fs.writeFileSync(downloads_csv_loc, '');

  for(let download of unique_downloads) {
    let path = download[3]
    if(fs.existsSync(path)) fs.appendFileSync(downloads_csv_loc, download.join(",") + "\n");
  }
}

function delete_music(path) {
  fs.unlinkSync(path)
}

async function search_yt(query) {
  if(ytpl.validateID(query)) {
    let res = await ytpl(query, { pages: Infinity });
    return res.items;
  }

  let options = {pages: 1}
  let res = await ytsr(query, options);
  let videos = res.items.filter(search_result => search_result.type === "video");

  return videos;
}

async function play_sound(info) {
  try {
    let audio_el = document.getElementById("song")
    let pause_btn = document.querySelector(".pause-btn")

    // Detach play_next so that when this sound ends,
    // it won't play the next song (facepalm)
    audio_el.removeEventListener("ended", play_next);

    let path_to_sound = info[3]
    audio_el.setAttribute('src', path_to_sound)

    // Show loading animation.
    let play_promise = audio_el.play();

    if(play_promise !== undefined) {
      play_promise.then(_ => {
        // Automatic playback started!
        // Show playing UI.
      })
      .catch(error => {
        // Auto-play was prevented
        // Show paused UI.
      });
    }

    pause_btn.querySelector("i").classList = "fa-solid fa-pause"
    audio_el.dispatchEvent(new CustomEvent("newtrack", {detail: info}))
  } catch(error) {
    throw error;
  }
}

function add_playlist(download_info) {
  playlist.push(download_info);
}

function del_playlist(index) {
  playlist.splice(index, 1);

  if(index < currentTrack) {
    currentTrack -= 1;
    return;
  }
  
  if(index === currentTrack) {
    if(currentTrack >= playlist.length || currentTrack < 0) return;
    play_playlist_index(currentTrack)
    return;
  }
}

async function play_next() {
  await play_playlist_index((currentTrack + 1) % playlist.length);
}

async function play_playlist_index(index) {
  if(index >= playlist.length || index < 0) {
    currentTrack = -1;
    throw `Index out of bounds: ${index}`;
  }

  let audio_el = document.getElementById("song")
  let info = playlist[index]

  currentTrack = index;

  await play_sound(info);

  // Attach play_next so that when the song ends,
  // it will play the next track in the playlist
  audio_el.addEventListener("ended", play_next);
}

async function toggle_pause() {
  let audio_el = document.getElementById("song")
  let pause_btn = document.querySelector(".pause-btn")

  // Check if audio is ready to play (4 = Can play)
  if(audio_el.readyState !== 4) return;
  
  if(!audio_el.paused) {
    pause_btn.querySelector("i").classList = "fa-solid fa-play"
    await audio_el.pause()
  } else {
    pause_btn.querySelector("i").classList = "fa-solid fa-pause"
    await audio_el.play()
  }
}

function shuffle_playlist() {
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  shuffle(playlist)
}

function get_playlist() {
  return playlist;
}

function import_playlist() {
  ipcRenderer.invoke("import_playlist");
}

function export_playlist() {
  ipcRenderer.invoke("export_playlist");
}

ipcRenderer.on("import_playlist", (event, data) => {
  const canceled = data.canceled;
  const paths = data.filePaths;
  
  if(canceled) return;
  
  let path = paths[0]
  const csv = unpack_csv(path);

  csv.forEach(video => {
    let video_url = video[0]
    let video_path = video[3]

    // If user does not have the video in their downloads csv, but has the video downloaded
    // Then add the video to their downloads csv
    if(!get_download_info(video_url) && fs.existsSync(video_path)) {
      fs.appendFileSync(downloads_csv_loc, video.join(",") + "\n");
    }

    add_playlist(video)
  });
  render_playlist()
});

ipcRenderer.on("export_playlist", (event, data) => {
  const canceled = data.canceled;
  const path = data.filePath;
  
  if(canceled) return;

  // Clear the csv
  fs.writeFileSync(path, '');
  
  for(let video of get_playlist()) {
    fs.appendFileSync(path, video.join(",") + "\n");
  }
})



function get_playlist_index(video_el) {
  return [...video_el.parentElement.querySelectorAll(".item")].indexOf(video_el);
}

module.exports = {download_music, search_yt, play_sound, unpack_csv, get_downloads_csv, get_download_info, delete_music, validate_downloads_csv, add_playlist, del_playlist, get_playlist, play_playlist_index, shuffle_playlist, import_playlist, export_playlist, get_playlist_index}


window.playlist = playlist;

