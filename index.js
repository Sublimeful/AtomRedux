const mplayer = require("./mplayer.js")
const ProgressBar = require('progressbar.js')

const search_bar = document.querySelector("#search-bar")

search_bar.addEventListener("keyup", async function(event) {
  if(event.code === "Enter") {
    event.preventDefault()

    let query = search_bar.value.trim();

    if(!query) return;

    let items = document.querySelector("#items")
    items.innerHTML = '<div class="loader center"></div>'
    
    let videos = await mplayer.search_yt(query)

    items.innerHTML = ''

    for(let video of videos) {
      render_video(video)
    }
  }
})

function start_player() {
  try {
    let current_time_el = document.querySelector(".current-time")
    let total_duration_el = document.querySelector(".total-duration")
    let progress_el = document.querySelector(".progress")
    let progress_container_el = document.querySelector(".progress-container")
    let audio_el = document.getElementById("song")

    function onseek(e) {
      let width = this.clientWidth
      let click_x = e.offsetX;
      let duration = audio_el.duration

      audio_el.currentTime = click_x/width * duration;
    }

    audio_el.addEventListener("timeupdate", () => {
      progress_el.style.width = `${audio_el.currentTime / audio_el.duration * 100}%`
    })

    audio_el.addEventListener("newtrack", e => {
      let info = e.detail;
      let thumb = info[1]
      let download_loc = info[3];
      let title = info[2]
      let title_el = document.getElementById("title")
      let image_el = document.getElementById("cover")

      image_el.src = thumb
      title_el.textContent = title
      progress_container_el.addEventListener("click", onseek);
    })

    audio_el.addEventListener("ended", () => {
      progress_container_el.removeEventListener("click", onseek);
    })
  } catch(error) {
    throw error;
  }
}

async function download_btn_clicked(video, video_el) {
  const download_btn = video_el.querySelector(".action-btn");
  download_btn.remove()

  const loader = document.createElement("div")
  loader.className = "loader"

  let download_canceled = false;
  let progress_bar;

  const cancel_download_btn_spoiler = document.createElement("span")
  const cancel_download_btn = create_action_btn("fa-solid fa-xmark", () => {
    download_canceled = true
    cancel_download_btn_spoiler.remove();
    loader.remove();

    if(progress_bar) {
      try {
        progress_bar.destroy()
      } catch(error) {
        console.error(error)
      }
    }

    video_el.appendChild(create_action_btn("fa fa-download", function() {
      download_btn_clicked(video, video_el);
    }));
  });

  const y_pos = video_el.getBoundingClientRect().y

  cancel_download_btn_spoiler.classList = "spoiler"
  cancel_download_btn_spoiler.style.top = `calc(${y_pos}px + 3rem/2)`

  
  cancel_download_btn.classList.add("cancel-download")
  cancel_download_btn_spoiler.appendChild(cancel_download_btn);

  video_el.appendChild(cancel_download_btn_spoiler);
  video_el.appendChild(loader);

  const [event_el, write_stream] = await mplayer.download_music(video.url);

  loader.remove()

  // Stop downloading if download has been canceled
  if(download_canceled) {
    write_stream.close()
    return;
  }

  progress_bar = new ProgressBar.Circle(video_el, {
    strokeWidth: 10,
    easing: 'easeInOut',
    color: 'orange',
    trailColor: '#eee',
    trailWidth: 1,
    svgStyle: null
  })

  let max_stroke_dash_offset = progress_bar.path.style.strokeDashoffset;
  progress_bar.set(0)

  event_el.addEventListener("progress", function(event) {
    console.log("progress")

    let progress = event.detail.progress
    let write_stream = event.detail.write_stream

    // Stop downloading if download has been canceled
    if(download_canceled) {
      write_stream.close();
      event_el.remove();
      return;
    }
    
    let stroke_dash_offset = max_stroke_dash_offset * (1 - progress)
    progress_bar.path.animate([
      {
        strokeDashoffset: progress_bar.path.style.strokeDashoffset
      },
      {
        strokeDashoffset: stroke_dash_offset
      }
    ], 200)
    progress_bar.path.style.strokeDashoffset = stroke_dash_offset

    // When finished downloading
    if(progress === 1) {
      const download_info = mplayer.get_download_info(video.url);

      // Append a play button to the video element
      video_el.appendChild(create_action_btn("fa-solid fa-play", function() {
        let download_loc = download_info[3]
        if(!fs.existsSync(download_loc)) {
          video_el.querySelectorAll(".action-btn").forEach(el => el.remove())
          video_el.appendChild(create_action_btn("fa fa-download", function() {
            download_btn_clicked(video, video_el);
          }));
          return;
        }
        mplayer.play_sound(download_info);
      }));

      // Append add to playlist button to the video element
      video_el.appendChild(create_action_btn("fa-solid fa-plus", function() {
        mplayer.add_playlist(download_info)
        render_playlist()
      }));

      progress_bar.destroy()
      event_el.remove()

      // Render downloads
      render_downloads()

      // Remove the cancel download button
      cancel_download_btn_spoiler.remove()

      return;
    }
  })
}

function create_video_el(video_title, video_thumb, video_url) {
  const video_el = document.createElement("div");
  video_el.className = "item";

  const thumb_el = document.createElement("img");
  thumb_el.className = "video-thumb";
  thumb_el.setAttribute("src", video_thumb);

  const title_el = document.createElement("h1");
  title_el.className = "video-title";
  title_el.textContent = video_title;

  const link_el = document.createElement("a");
  link_el.href = video_url;
  link_el.addEventListener("click", event => {
    //preventDefault as to not redirect to link on click
    event.preventDefault();
  })

  video_el.appendChild(link_el);
  video_el.appendChild(title_el);
  link_el.appendChild(thumb_el);

  return video_el;
}

function create_action_btn(icon_class_list, action) {
  const action_btn = document.createElement("button");
  const action_icon = document.createElement("i");
  action_icon.classList = icon_class_list;
  action_btn.className = "action-btn"
  action_btn.appendChild(action_icon)
  action_btn.onclick = action;

  return action_btn;
}

function render_video(video) {
  const video_title = video.title;
  const video_thumb = video.thumbnails[video.thumbnails.length - 1].url;
  const video_url = `https://youtu.be/${video.id}`;

  const items_el = document.getElementById("items");

  const video_el = create_video_el(video_title, video_thumb, video_url);

  const download_info = mplayer.get_download_info(video_url);

  if(!download_info) {
    video_el.appendChild(create_action_btn("fa fa-download", function() {
      download_btn_clicked(video, video_el);
    }));
  } else {
    video_el.appendChild(create_action_btn("fa-solid fa-play", function() {
      let download_loc = download_info[3]
      if(!fs.existsSync(download_loc)) {
        video_el.querySelectorAll(".action-btn").forEach(el => el.remove())
        video_el.appendChild(create_action_btn("fa fa-download", function() {
          download_btn_clicked(video, video_el);
        }));
        return;
      }
      mplayer.play_sound(download_info);
    }));
    video_el.appendChild(create_action_btn("fa-solid fa-plus", function() {
      mplayer.add_playlist(download_info)
      render_playlist()
    }));
  }

  items_el.appendChild(video_el);
}

function render_downloads() {
  try {
    let downloads = mplayer.get_downloads_csv()
    let downloads_el = document.getElementById("my-downloads")

    for(let index = downloads_el.children.length - 1; index >= 0; index--) {
      let child = downloads_el.children[index];
      if(child.className !== "item") continue;
      child.remove();
    }

    for(let info of downloads) {
      let url = info[0]
      let thumb = info[1]
      let title = info[2]
      let path = info[3]

      let video_el = create_video_el(title, thumb, url);

      downloads_el.appendChild(video_el);

      video_el.appendChild(create_action_btn("fa-solid fa-play", function() {
        mplayer.play_sound(info);
      }));

      video_el.appendChild(create_action_btn("fa fa-trash", function() {
        mplayer.delete_music(path)
        render_downloads()
      }));

      video_el.appendChild(create_action_btn("fa-solid fa-plus", function() {
        mplayer.add_playlist(info)
        render_playlist()
      }));
    }

  } catch(error) {
    console.error(error);
    throw error;
  }
}

function render_playlist() {
  let playlist = mplayer.get_playlist()
  let playlist_el = document.getElementById("my-playlist")

  for(let index = playlist_el.children.length - 1; index >= 0; index--) {
    let child = playlist_el.children[index];
    if(child.className !== "item") continue;
    child.remove();
  }

  for(let download of playlist) {
    let video_url = download[0]
    let thumb = download[1]
    let title = download[2]
    let path = download[3]
    
    let video_el = create_video_el(title, thumb, video_url)

    
    playlist_el.append(video_el);

    video_el.appendChild(create_action_btn("fa-solid fa-play", function() {
      mplayer.play_playlist_index(get_playlist_index(video_el));
    }));

    video_el.appendChild(create_action_btn("fa fa-trash", function() {
      mplayer.del_playlist(get_playlist_index(video_el));
      render_playlist()
    }));
  }
}

function add_all_to_playlist() {
  let downloads = get_downloads_csv()
  
  for(let info of downloads) {
    mplayer.add_playlist(info);
  }

  render_playlist();
}

function shuffle_playlist() {
  mplayer.shuffle_playlist();

  render_playlist();
}

function get_playlist_index(video_el) {
  return [...video_el.parentElement.querySelectorAll(".item")].indexOf(video_el);
}

/* Set the width of the sidebar to 250px and the left margin of the page content to 250px */
function open_playlist() {
  document.getElementById("my-playlist").style.width = "50vw";
}

/* Set the width of the sidebar to 0 and the left margin of the page content to 0 */
function close_playlist() {
  document.getElementById("my-playlist").style.width = "0";
}

/* Set the width of the sidebar to 250px and the left margin of the page content to 250px */
function open_downloads() {
  document.getElementById("my-downloads").style.width = "50vw";
}

/* Set the width of the sidebar to 0 and the left margin of the page content to 0 */
function close_downloads() {
  document.getElementById("my-downloads").style.width = "0";
}

render_downloads()
start_player()
mplayer.validate_downloads_csv()




