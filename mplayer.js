const { ipcRenderer } = require("electron");

const ytpl = require('ytpl');
const ytdl = require("ytdl-core")
const ytsr = require("ytsr")
const fs = require("fs")
const path = require("path")

const music_location = path.resolve(path.join(__dirname, "../", "Music"))
const download_location = path.resolve(path.join(music_location, "Downloads"))
const playlist_location = path.resolve(path.join(music_location, "Playlists"))
const downloads_csv_loc = path.resolve(path.join(download_location, "Downloads.csv"))
const csv_delimiter = '|'

if(!fs.existsSync(music_location)) fs.mkdirSync(music_location)
if(!fs.existsSync(download_location)) fs.mkdirSync(download_location)
if(!fs.existsSync(playlist_location)) fs.mkdirSync(playlist_location)
if(!fs.existsSync(downloads_csv_loc)) fs.writeFileSync(downloads_csv_loc, "")

let currentTrack = -1;
let playlist = [];



function convert_to_csv(string) {
  return string.replace(/[/\\?%*:|"<>]/g, '-');
}

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
  let unpacked = data.split("\n").filter(_ => _).map(_ => _.split(csv_delimiter));

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

    // Convert to csv
    let valid_title = convert_to_csv(title)
    let valid_file_name = `${valid_title}.${best_audio.container}`;

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
          let video_data_csv = [url, thumb.url, valid_title, output];

          fs.appendFileSync(downloads_csv_loc, video_data_csv.join(csv_delimiter) + "\n");
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
    if(fs.existsSync(path)) fs.appendFileSync(downloads_csv_loc, download.join(csv_delimiter) + "\n");
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
  
  if(ytdl.validateURL(query)) {
    let res = await ytdl.getBasicInfo(query)
    let video = {
      title: res.videoDetails.title,
      thumbnails: res.videoDetails.thumbnails,
      id: res.videoDetails.videoId
    }

    return [video];
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
    let song_thumb_container = document.querySelector(".img-container")

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

    // Set play css
    pause_btn.querySelector("i").classList = "fa-solid fa-pause"
    song_thumb_container.classList.add("play")

    // Dispatch new track element
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
    // If currently idling, then dont do anything
    if(currentTrack < 0) return;

    // Deleting last element from playlist and currentTrack is that last element
    if(currentTrack >= playlist.length && playlist.length > 0) {
      play_playlist_index(playlist.length - 1);
      return;
    }

    play_playlist_index(currentTrack);
    return;
  }
}

async function play_next() {
  // If playlist has been cleared of everything,
  // then there's nothing left to play!
  if(playlist.length === 0) return;

  // If idling, then do not play the 0th index
  if(currentTrack < 0) return;
  
  await play_playlist_index((currentTrack + 1) % playlist.length);
}

async function play_playlist_index(index) {
  if(index >= playlist.length || index < 0 || isNaN(index)) {
    currentTrack = -1;
    throw `Index out of bounds or NaN: ${index}`;
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
  let song_thumb_container = document.querySelector(".img-container")

  // Check if audio is ready to play (4 = Can play)
  if(audio_el.readyState !== 4) return;
  
  if(!audio_el.paused) {
    // Set paused css
    pause_btn.querySelector("i").classList = "fa-solid fa-play"
    song_thumb_container.classList.remove("play")

    await audio_el.pause()
  } else {
    // Set playing css
    pause_btn.querySelector("i").classList = "fa-solid fa-pause"
    song_thumb_container.classList.add("play")

    await audio_el.play()
  }
}

function shuffle_playlist() {
  let new_order = []

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];

      // Predict what currentTrack will be
      if(currentTrack === i) {
        currentTrack = j;
      } else if(currentTrack === j) {
        currentTrack = i;
      }

      // Push into new_order
      new_order.push(j)
    }
    return a;
  }

  shuffle(playlist)
  return new_order
}

function get_playlist() {
  return playlist;
}

function import_playlist() {
  ipcRenderer.invoke("import_playlist", playlist_location);

}

function export_playlist() {
  ipcRenderer.invoke("export_playlist", playlist_location);
}

ipcRenderer.on("import_playlist", (event, data) => {
  const canceled = data.canceled;
  const paths = data.filePaths;

  if(canceled) return;

  const csv_path = paths[0]
  const csv = unpack_csv(csv_path);

  csv.forEach(video => {
    let video_url = video[0]
    let video_thumb = video[1]
    let video_title = video[2]

    // Update the path so it stays consistent with user's computer
    // Extract file extension using regex and get new video_path
    let container = video[3].match(/\.[0-9a-z]+$/i)[0].substr(1)

    // Convert to csv
    let valid_title = convert_to_csv(video_title);
    let valid_file_name = `${valid_title}.${container}`;

    // Get video path
    let video_path = path.resolve(path.join(download_location, valid_file_name));

    // If user does not have the video in their downloads csv, but has the video downloaded
    // Then add the video to their downloads csv
    let download_info = [video_url, video_thumb, valid_title, video_path];

    if(!get_download_info(video_url) && fs.existsSync(video_path)) {
      fs.appendFileSync(downloads_csv_loc, download_info.join(csv_delimiter) + "\n");
    }

    add_playlist(download_info)
    add_playlist_el(download_info)
  });
});

ipcRenderer.on("export_playlist", (event, data) => {
  const canceled = data.canceled;
  const path = data.filePath;

  if(canceled) return;

  // Clear the csv
  fs.writeFileSync(path, '');

  for(let video of get_playlist()) {
    fs.appendFileSync(path, video.join(csv_delimiter) + "\n");
  }
})

function clear_playlist() {
  currentTrack = -1;
  playlist = [];
}

function get_playlist_index(video_el) {
  return [...video_el.parentElement.querySelectorAll(".item")].indexOf(video_el);
}

