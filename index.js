const ProgressBar = require('progressbar.js')
const search_bar = document.querySelector("#search-bar")

search_bar.addEventListener("keyup", async function(event) {
  if(event.code === "Enter") {
    event.preventDefault()

    await search()
  }
})

async function search() {
  let query = search_bar.value.trim();

  if(!query) return;

  let items = document.querySelector("#items")
  items.innerHTML = '<div class="loader center"></div>'

  let videos = await search_yt(query)

  items.innerHTML = ''

  for(let video of videos) {
    render_video(video)
  }
}

function create_add_to_playlist_btn(download_info) {
  return create_action_btn("Add to Playlist", "fa-solid fa-plus", function() {
    add_playlist(download_info)
    add_playlist_el(download_info);
  })
}

/* Creates play button, if can't play, then provide download button */
function create_play_btn(download_info, video_url, video_el) {
  return create_action_btn("Play", "fa-solid fa-play", function() {
    if(!video_el.parentNode) return;

    let download_loc = download_info[3]
    if(!fs.existsSync(download_loc)) {
      video_el.querySelectorAll(".action-btn").forEach(el => el.remove())
      video_el.appendChild(create_download_btn(video_url, video_el));
      return;
    }
    
    if(video_el.parentNode.id === "my-playlist") {
      play_playlist_index(get_playlist_index(video_el));
    } else {
      play_sound(download_info);
    }
  })
}

/* Create download button */
function create_download_btn(video_url, video_el) {
  return create_action_btn("Download", "fa fa-download", function() {
    download_btn_clicked(video_url, video_el);
  })
}

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
      progress_container_el.removeEventListener("click", onseek);
      progress_container_el.addEventListener("click", onseek);
    })

    audio_el.addEventListener("ended", () => {
      let pause_btn = document.querySelector(".pause-btn")
      pause_btn.querySelector("i").classList = "fa-solid fa-play"
    })
  } catch(error) {
    throw error;
  }
}

async function download_btn_clicked(video_url, video_el) {
  const download_btn = video_el.querySelector(".action-btn");
  download_btn.remove()

  const loader = document.createElement("div")
  loader.className = "loader"
  video_el.appendChild(loader);

  let download_canceled = false;
  let progress_bar;

  const cancel_download_btn_spoiler = document.createElement("span")
  cancel_download_btn_spoiler.classList = "spoiler"

  const cancel_download_btn = create_action_btn("Cancel Download", "fa-solid fa-xmark", () => {
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

    video_el.appendChild(create_download_btn(video_url, video_el));
  });

  cancel_download_btn.classList.add("cancel-download")
  cancel_download_btn_spoiler.appendChild(cancel_download_btn);

  video_el.appendChild(cancel_download_btn_spoiler);

  const [event_el, write_stream] = await download_music(video_url);

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
      const download_info = get_download_info(video_url);

      // Checks if video_el has a parent (if it doesnt, then it has been removed prematurely)
      if(video_el.parentNode) {
        // Append a play button to the video element
        video_el.appendChild(create_play_btn(download_info, video_url, video_el));

        if(video_el.parentNode.id !== "my-playlist") {
          // Append add to playlist button to the video element
          video_el.appendChild(create_add_to_playlist_btn(download_info));
        } else {
          // Append remove from playlist button to the video element
          video_el.appendChild(create_action_btn("Remove from Playlist", "fa fa-trash", function() {
            let index = get_playlist_index(video_el)
            del_playlist(index);
            del_playlist_el(index);
          }));
        }
      }

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

function create_action_btn(tooltip, icon_class_list, action) {
  const action_btn = document.createElement("button");
  const action_icon = document.createElement("i");
  action_icon.classList = icon_class_list;
  action_btn.className = "action-btn"
  action_btn.setAttribute("title", tooltip)
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

  const download_info = get_download_info(video_url);

  if(!download_info) {
    video_el.appendChild(create_download_btn(video_url, video_el));
  } else {
    video_el.appendChild(create_play_btn(download_info, video_url, video_el));
    video_el.appendChild(create_add_to_playlist_btn(download_info));
  }

  items_el.appendChild(video_el);
}

function render_downloads() {
  try {
    validate_downloads_csv()

    let downloads = get_downloads_csv()
    let downloads_el = document.getElementById("my-downloads")

    for(let index = downloads_el.children.length - 1; index >= 0; index--) {
      let child = downloads_el.children[index];
      if(child.className !== "item") continue;
      child.remove();
    }

    for(let download_info of downloads) {
      let video_url = download_info[0]
      let video_thumb = download_info[1]
      let video_title = download_info[2]
      let video_path = download_info[3]

      let video_el = create_video_el(video_title, video_thumb, video_url);

      downloads_el.appendChild(video_el);

      video_el.appendChild(create_play_btn(download_info, video_url, video_el));

      video_el.appendChild(create_action_btn("Delete", "fa fa-trash", function() {
        delete_music(video_path)
        render_downloads()
      }));

      video_el.appendChild(create_add_to_playlist_btn(download_info));
    }

  } catch(error) {
    console.error(error);
    throw error;
  }
}

/** Replace playlist item's button with download if
    the music file is missing */
function update_playlist_el() {
  let playlist_el = document.getElementById("my-playlist")

  for(let i = 0; i < playlist.length; i++) {
    let info = playlist[i]
    let video_url = info[0]
    let download_loc = info[3]

    if(!fs.existsSync(download_loc)) {
      let video_el = playlist_el.querySelectorAll(".item")[i]

      video_el.querySelectorAll(".action-btn").forEach(el => el.remove())
      video_el.appendChild(create_download_btn(video_url, video_el));
    }
  }
}

function add_playlist_el(download_info) {
  let playlist_el = document.getElementById("my-playlist")
  
  let video_url = download_info[0]
  let video_thumb = download_info[1]
  let video_title = download_info[2]
  let video_path = download_info[3]

  let video_el = create_video_el(video_title, video_thumb, video_url);

  playlist_el.append(video_el);
  
  // If User has the downloaded music file
  if(fs.existsSync(video_path)) {
    video_el.appendChild(create_play_btn(download_info, video_url, video_el));

    video_el.appendChild(create_action_btn("Remove from Playlist", "fa fa-trash", function() {
      let index = get_playlist_index(video_el)
      del_playlist(index);
      del_playlist_el(index);
    }));
  } else {
    video_el.appendChild(create_download_btn(video_url, video_el));
  }
}

function del_playlist_el(index) {
  let playlist_el = document.getElementById("my-playlist")
  let items = playlist_el.querySelectorAll(".item")
  
  items[index].remove()
}

function shuffle_btn_clicked() {
  function swap_nodes(obj1, obj2) {
    // create marker element and insert it where obj1 is
    var temp = document.createElement("div");
    obj1.parentNode.insertBefore(temp, obj1);

    // move obj1 to right before obj2
    obj2.parentNode.insertBefore(obj1, obj2);

    // move obj2 to right before where obj1 used to be
    temp.parentNode.insertBefore(obj2, temp);

    // remove temporary marker node
    temp.parentNode.removeChild(temp);
  }

  let playlist_el = document.getElementById("my-playlist")
  let new_order = shuffle_playlist();

  // Append items back based on new order
  // new_order.length === items.length - 1
  let c = 0;
  for(let i = new_order.length; i > 0; i--) {
    let items = playlist_el.querySelectorAll(".item")

    let j = new_order[c]
    let node1 = items[i]
    let node2 = items[j]

    swap_nodes(node1, node2);

    c++;
  }
}


function add_all_btn_clicked() {
  let downloads = get_downloads_csv()
  
  for(let info of downloads) {
    add_playlist(info);
    add_playlist_el(info);
  }
}

function download_all_undownloaded_btn_clicked(parent_container) {
  parent_container.querySelectorAll(".item").forEach(video_el => {
    let download_btn_icon = video_el.querySelector(".action-btn > i.fa-download");
    if(!download_btn_icon) return;

    let download_btn = download_btn_icon.parentNode;
    download_btn.click();
  })
}

function clear_playlist_btn_clicked() {
  clear_playlist()

  let playlist_el = document.getElementById("my-playlist")
  let items = playlist_el.querySelectorAll(".item")

  for(let index = items.length - 1; index >= 0; index--) {
    del_playlist_el(index);
  }
}

/* Set the width of the sidebar to 250px and the left margin of the page content to 250px */
function open_playlist() {
  // Updates the playlist elements
  update_playlist_el()
  
  // Open the playlist
  document.getElementById("my-playlist").style.width = "50vw";
}

/* Set the width of the sidebar to 0 and the left margin of the page content to 0 */
function close_playlist() {
  document.getElementById("my-playlist").style.width = "0";
}

/* Set the width of the sidebar to 250px and the left margin of the page content to 250px */
function open_downloads() {
  // Render downloads
  render_downloads()

  // Open downloads
  document.getElementById("my-downloads").style.width = "50vw";
}

/* Set the width of the sidebar to 0 and the left margin of the page content to 0 */
function close_downloads() {
  document.getElementById("my-downloads").style.width = "0";
}

render_downloads()
start_player()

