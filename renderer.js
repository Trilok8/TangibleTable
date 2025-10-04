const titleEl  = document.getElementById("titlebar");
const countsEl = document.getElementById("counts");
const lastoscEl= document.getElementById("lastosc");
const linkList = document.getElementById("link-list");
const websiteIframe = document.getElementById("website-iframe");
const tagReadingsList = document.getElementById("tag-readings-list");

// Tags configuration - loaded from JSON
let tagsConfig = {};
let currentActiveTag = null;

// PNG Sequence Animation variables
let hudAnimation = null;
let hudAnimationInterval = null;
let currentFrame = 169; // Starting frame number
const totalFrames = 131; // Total number of frames (169 to 299)
const animationSpeed = 20;// Milliseconds between frames (20 FPS)
let currentTagPosition = null; // Store current tag position

// PNG Sequence Animation Functions
function initializeHUDAnimation() {
  hudAnimation = document.getElementById('hud-animation');
  if (!hudAnimation) {
    console.error('❌ HUD animation element not found');
    return;
  }
  console.log('🎬 HUD animation initialized');
}

function startHUDAnimation(tagX, tagY) {
  if (!hudAnimation || hudAnimationInterval) return;
  
  // Store tag position
  currentTagPosition = { x: tagX, y: tagY };
  
  // Convert TUIO coordinates (0-1) to screen pixels
  const screenX = tagX * window.innerWidth;
  const screenY = tagY * window.innerHeight;
  
  console.log('🎬 Starting HUD animation at position:', { x: screenX, y: screenY });
  
  // Position the animation at tag location
  hudAnimation.style.left = screenX + 'px';
  hudAnimation.style.top = screenY + 'px';
  hudAnimation.style.display = 'block';
  hudAnimation.classList.add('visible');
  
  hudAnimationInterval = setInterval(() => {
    const frameNumber = currentFrame.toString().padStart(5, '0');
    hudAnimation.src = `assets/tangible/HUD Png/HUD_${frameNumber}.png`;
    
    currentFrame++;
    if (currentFrame > 299) {
      currentFrame = 169; // Loop back to start
    }
  }, animationSpeed);
}

function stopHUDAnimation() {
  if (!hudAnimation || !hudAnimationInterval) return;
  
  console.log('🎬 Stopping HUD animation');
  clearInterval(hudAnimationInterval);
  hudAnimationInterval = null;
  
  hudAnimation.classList.remove('visible');
  setTimeout(() => {
    hudAnimation.style.display = 'none';
  }, 300); // Wait for fade out transition
}

// Load tags configuration from JSON
async function loadTagsConfig() {
  try {
    const response = await fetch('./tags.json');
    tagsConfig = await response.json();
    console.log("📋 Tags configuration loaded:", tagsConfig);
  } catch (error) {
    console.error("❌ Failed to load tags configuration:", error);
  }
}

// Create dynamic buttons based on tag configuration
function createDynamicButtons(tagId) {
  const controlPanel = document.querySelector('.control-panel');
  if (!controlPanel) return;
  
  // Remove existing buttons (except the panel title and tag readings)
  const existingButtons = controlPanel.querySelectorAll('.website-btn');
  existingButtons.forEach(btn => btn.remove());
  
  const tagConfig = tagsConfig[tagId];
  if (!tagConfig) {
    console.warn(`⚠️ No configuration found for tag ${tagId}`);
    return;
  }
  
  // Create buttons for this tag
  const buttonsContainer = document.createElement('div');
  buttonsContainer.className = 'buttons-container';
  
  tagConfig.buttons.forEach((buttonConfig, index) => {
    const btn = document.createElement('button');
    btn.className = 'website-btn';
    if (index === 0) btn.classList.add('active'); // First button is active by default
    btn.textContent = buttonConfig.text;
    btn.setAttribute('data-url', buttonConfig.url);
    btn.title = buttonConfig.url;
    
    // Add click event listener
    btn.addEventListener('click', () => {
      // Remove active class from all buttons
      const allButtons = buttonsContainer.querySelectorAll('.website-btn');
      allButtons.forEach(b => b.classList.remove('active'));
      
      // Add active class to clicked button
      btn.classList.add('active');
      
      // Load the new website with current tag position
      if (currentTagPosition) {
        showWebsiteOverlay(buttonConfig.url, currentTagPosition.x, currentTagPosition.y);
      } else {
        showWebsiteOverlay(buttonConfig.url);
      }
    });
    
    buttonsContainer.appendChild(btn);
  });
  
  // Insert buttons container before tag readings
  const tagReadings = controlPanel.querySelector('.tag-readings');
  if (tagReadings) {
    controlPanel.insertBefore(buttonsContainer, tagReadings);
  } else {
    controlPanel.appendChild(buttonsContainer);
  }
}

// Your links
const LINKS = [
  "https://siwar.ksaa.gov.sa/public-dict-information/Riyadh",
  "https://siwar.ksaa.gov.sa/public-dict-information/6a6b2873-4ad1-4a9f-89c7-1f07ccbb476d",
  "https://siwar.ksaa.gov.sa/public-dict-information/73ce2496-7b2a-4bb0-a8c0-84ea5b1bd677",
  "https://siwar.ksaa.gov.sa/public-dict-information/0f0ad290-0fa5-4983-bb56-7144c641cc8c",
  "https://siwar.ksaa.gov.sa/public-dict-information/4cd164a7-7160-4de8-af5c-34382f5da657",
  "https://siwar.ksaa.gov.sa/public-dict-information/2813060b-8eda-4c7b-8b10-1fc3255305cb",
  "https://siwar.ksaa.gov.sa/public-dict-information/2885a7fb-c347-4390-92c9-808c9b9b17c2",
  "https://siwar.ksaa.gov.sa/public-dict-information/4fc63968-9cd8-47d9-a32e-aadc6c6a265b",
  "https://siwar.ksaa.gov.sa/public-dict-information/54a32a50-2b7e-49c2-9aa4-897f58fae786",
  "https://siwar.ksaa.gov.sa/public-dict-information/77843d16-9315-4f87-b891-80a9399fdf54",
  "https://siwar.ksaa.gov.sa/public-dict-information/7806f9cf-4bdb-4c10-b9e5-2705d8945603",
  "https://siwar.ksaa.gov.sa/public-dict-information/84c98c01-6b96-469c-918f-e8d59fffe8ce",
  "https://siwar.ksaa.gov.sa/public-dict-information/928f4f87-b98c-4b2d-b31d-0b45c6747644",
  "https://siwar.ksaa.gov.sa/public-dict-information/94d205e3-6e93-4b6b-a245-1d5304b3ed7d",
  "https://siwar.ksaa.gov.sa/public-dict-information/97ac5360-d65f-425f-974f-9118f09d13a6",
  "https://siwar.ksaa.gov.sa/public-dict-information/a92ca8f8-fe2b-4ab2-8ef5-5bd374c1f082",
  "https://siwar.ksaa.gov.sa/public-dict-information/ae041c6d-79e6-42c3-b54b-ffbf28c88b9a",
  "https://siwar.ksaa.gov.sa/public-dict-information/b09d4471-8198-4a82-b9f9-5fa97b140e2b",
  "https://siwar.ksaa.gov.sa/public-dict-information/b4759d02-40ef-4df5-a818-4081a11c338c",
  "https://siwar.ksaa.gov.sa/public-dict-information/b60a0505-57cb-436a-8a07-75b062de8013",
  "https://siwar.ksaa.gov.sa/public-dict-information/c59be8de-20c3-482b-ab57-ce923dfb4cee",
  "https://siwar.ksaa.gov.sa/public-dict-information/d9af896a-6afb-4859-b35a-0a3b1618dc83",
  "https://siwar.ksaa.gov.sa/public-dict-information/e662ca1b-ed42-4fdb-bbd3-26bbb15df897",
  "https://siwar.ksaa.gov.sa/public-dict-information/e740316b-bc1e-4b62-81a4-c26d787bdeb6",
  "https://siwar.ksaa.gov.sa/public-dict-information/12cbfc6f-b58d-4116-852e-0744ba950b5c",
  "https://siwar.ksaa.gov.sa/public-dict-information/2202f51d-7d70-4472-9fc0-f178fb425463",
  "https://siwar.ksaa.gov.sa/public-dict-information/418913c1-8e46-450d-ab28-7694b51a6047",
  "https://siwar.ksaa.gov.sa/public-dict-information/4e36115e-07b0-4a92-9e04-7ce3fe6a2e96",
  "https://siwar.ksaa.gov.sa/public-dict-information/71c16f98-93e1-4cf1-a401-293b4e0ffe07",
  "https://siwar.ksaa.gov.sa/public-dict-information/89af196b-70be-4a4b-b193-4b761e0b0fdd",
  "https://siwar.ksaa.gov.sa/public-dict-information/9be14020-1138-4651-8d3f-713ee1d0c750",
  "https://siwar.ksaa.gov.sa/public-dict-information/a95a483e-e6b5-4f66-ba12-45b5b54d8f9e",
  "https://siwar.ksaa.gov.sa/public-dict-information/d0328aad-1959-4a9f-9cc8-f23216399c3a",
  "https://siwar.ksaa.gov.sa/public-dict-information/f990c2a0-f601-466f-8153-2cd35e4710a3"
];

// Build the list
// (function buildList() {
//   linkList.innerHTML = "";
//   LINKS.forEach((url, idx) => {
//     const btn = document.createElement("button");
//     btn.className = "link-btn";
//     try {
//       const u = new URL(url);
//       const segs = u.pathname.split("/").filter(Boolean);
//       const last = segs[segs.length - 1] || u.host;
//       btn.textContent = `${idx + 1}. ${last}`;
//     } catch { btn.textContent = `${idx + 1}. ${url}`; }
//     btn.title = url;
//     btn.addEventListener("click", () => window.actions?.openSiteView?.(url));
//     linkList.appendChild(btn);
//   });
// })();

// ------- TUIO tracking -------
const cursors  = new Map();
const objects  = new Map();

window.appState?.onInit?.(({ titleText }) => { if (titleEl) titleEl.textContent = titleText || "Display"; });

// Update HUD with current counts
// function updateHUD() {
//   countsEl.textContent = `obj:${objects.size} cur:${[...cursors.keys()].length}`;
// }

// Website button functionality
function initializeWebsiteButtons() {
  const buttons = document.querySelectorAll('.website-btn');
  
  buttons.forEach(button => {
    button.addEventListener('click', () => {
      // Remove active class from all buttons
      buttons.forEach(btn => btn.classList.remove('active'));
      
      // Add active class to clicked button
      button.classList.add('active');
      
      // Update iframe source
      const url = button.getAttribute('data-url');
      if (websiteIframe && url) {
        websiteIframe.src = url;
        console.log(`🌐 Loading website: ${url}`);
      }
    });
  });
}

// Update tag readings display
// function updateTagReadings() {
//   if (!tagReadingsList) return;
  
//   if (objects.size === 0) {
//     tagReadingsList.innerHTML = '<div class="reading-item">No tags detected</div>';
//     return;
//   }
  
//   let readingsHTML = '';
//   objects.forEach((tag, sessionId) => {
//     readingsHTML += `
//       <div class="reading-item">
//         <strong>Tag ${tag.id}</strong><br>
//         Pos: (${tag.x.toFixed(2)}, ${tag.y.toFixed(2)})<br>
//         Angle: ${(tag.angle || 0).toFixed(1)}°
//       </div>
//     `;
//   });
  
//   tagReadingsList.innerHTML = readingsHTML;
// }

// Show website using Electron BrowserView
async function showWebsiteOverlay(url, tagX = null, tagY = null) {
  // Start HUD animation at tag position
  if (tagX !== null && tagY !== null) {
    startHUDAnimation(tagX, tagY);
  } else {
    startHUDAnimation();
  }
  
  // Show preloader
  const preloader = document.getElementById('browserViewLoader');
  if (preloader) {
    preloader.style.display = 'flex';
  }
  
  try {
    // Use your existing IPC system to open the website in BrowserView
    const success = await window.actions?.openSiteView?.(url);
    if (success) {
      console.log(`🌐 Website opened in BrowserView: ${url}`);
    } else {
      console.error(`🌐 Failed to open website: ${url}`);
    }
  } catch (error) {
    console.error('Error opening website:', error);
  } finally {
    // Hide preloader after a short delay to ensure BrowserView is visible
    setTimeout(() => {
      if (preloader) {
        preloader.style.display = 'none';
      }
    }, 1000);
  }
}

// Hide website overlay (close BrowserView)
async function hideWebsiteOverlay() {
  try {
    // Stop HUD animation
    stopHUDAnimation();
    
    // Hide preloader if visible
    const preloader = document.getElementById('browserViewLoader');
    if (preloader) {
      preloader.style.display = 'none';
    }
    
    // Close the BrowserView using your existing IPC system
    const success = await window.actions?.closeSiteView?.();
    if (success) {
      console.log(`🌐 BrowserView closed`);
    } else {
      console.error(`🌐 Failed to close BrowserView`);
    }
  } catch (error) {
    console.error('Error closing BrowserView:', error);
  }
}

// Initialize the application
async function initializeApp() {
  await loadTagsConfig();
  initializeHUDAnimation();
  console.log("🚀 Application initialized with dynamic tag system");
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
  initializeBackgroundVideo();
});

// Initialize background video to prevent pausing
function initializeBackgroundVideo() {
  const bgVideo = document.getElementById('bg-video');
  if (!bgVideo) return;

  // Ensure video plays and doesn't get paused
  const ensureVideoPlaying = () => {
    if (bgVideo.paused) {
      bgVideo.play().catch(e => console.log('Video play failed:', e));
    }
  };

  // Check every 2 seconds if video is paused and restart if needed
  setInterval(ensureVideoPlaying, 2000);

  // Restart video on various events that might cause pausing
  bgVideo.addEventListener('pause', () => {
    setTimeout(() => bgVideo.play().catch(e => console.log('Video restart failed:', e)), 100);
  });

  bgVideo.addEventListener('ended', () => {
    bgVideo.currentTime = 0;
    bgVideo.play().catch(e => console.log('Video loop failed:', e));
  });

  // Ensure video starts playing
  bgVideo.play().catch(e => console.log('Initial video play failed:', e));
}

function setLast(addr){ if (lastoscEl) lastoscEl.textContent = `last: ${addr}`; }

function logTagDetails(tag) {
  
  // Log screen dimensions
  console.log("📐 Screen Dimensions:", {
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    screenWidth: screen.width,
    screenHeight: screen.height,
    availWidth: screen.availWidth,
    availHeight: screen.availHeight,
    devicePixelRatio: window.devicePixelRatio
  });
  
  console.log("🎯 Tag Placed:", {
    sessionId: tag.sid,
    tagId: tag.id,
    position: { x: tag.x, y: tag.y },
    angle: tag.angle,
    timestamp: new Date().toISOString()
  });
  console.log("📊 Raw Tag Data:", tag);
  
  // Check if this tag is in our configuration
  if (tagsConfig[tag.id]) {
    showMainInterface();
    createDynamicButtons(tag.id);
    currentActiveTag = tag.id;
    currentTagPosition = { x: tag.x, y: tag.y }; // Store tag position
    
    // Automatically show the first website when tag is placed
    if (tagsConfig[tag.id].buttons.length > 0) {
      showWebsiteOverlay(tagsConfig[tag.id].buttons[0].url, tag.x, tag.y);
    }
    
    console.log(`🎬 Interface activated for tag ${tag.id}`);
  }
}

// Show main interface when tag 204 is detected
function showMainInterface() {
  const mainContainer = document.querySelector('.main-container');
  if (mainContainer && !mainContainer.classList.contains('show')) {
    mainContainer.classList.add('show');
    console.log("🎬 Main interface revealed by tag 204!");
  }
}

// Hide main interface when tag 204 is removed
function hideMainInterface() {
  const mainContainer = document.querySelector('.main-container');
  if (mainContainer && mainContainer.classList.contains('show')) {
    mainContainer.classList.remove('show');
    currentActiveTag = null;
    currentTagPosition = null; // Clear tag position
    console.log("🎬 Main interface hidden - active tag removed!");
  }
}

// Check if a specific tag ID is present
function hasTag(tagId) {
  for (const tag of objects.values()) {
    if (tag.id === tagId) {
      return true;
    }
  }
  return false;
}

function handleTuio1(path, args) {
  if (path === "/tuio/2Dcur") {
    const cmd = args[0];
    if (cmd === "set") {
      const sid = String(args[1]); const x=args[2], y=args[3];
      cursors.set(sid, { sid, x, y });
    } else if (cmd === "alive") {
      // Handle cursor removal
      const aliveIds = new Set(args.slice(1).map(String));
      for (const [sid] of cursors) {
        if (!aliveIds.has(sid)) {
          cursors.delete(sid);
        }
      }
    }
  } else if (path === "/tuio/2Dobj") {
    const cmd = args[0];
    if (cmd === "set") {
      const s = String(args[1]); const id=args[2], x=args[3], y=args[4], a=args[5];
      const tag = { sid:s, id, x, y, angle:a };
      
      // Check if this is a new tag placement
      if (!objects.has(s)) {
        logTagDetails(tag);
      }
      
      objects.set(s, tag);
      // updateHUD();
      // updateTagReadings();
    } else if (cmd === "alive") {
      // Handle object removal
      const aliveIds = new Set(args.slice(1).map(String));
      const removedTags = [];
      
      for (const [sid, tag] of objects) {
        if (!aliveIds.has(sid)) {
          removedTags.push(tag);
          objects.delete(sid);
        }
      }
      
      // Check if any removed tag was the active one
      if (removedTags.length > 0 && currentActiveTag) {
        const wasActiveTagRemoved = removedTags.some(tag => tag.id === currentActiveTag);
        if (wasActiveTagRemoved) {
          hideMainInterface();
          hideWebsiteOverlay(); // Close BrowserView when tag is removed
        }
      }
      
      // updateHUD();
      // updateTagReadings();
    }
  }
}
function handleTuio2(path, args) {
  if (path === "/tuio2/ptr") {
    if (typeof args[0] === "string") {
      const cmd = args[0];
      if (cmd === "set") {
        const sid = String(args[1]); const x=Number(args[2]); const y=Number(args[3]);
        if (!Number.isNaN(x) && !Number.isNaN(y)) cursors.set(sid, { sid, x, y });
      } else if (cmd === "alive") {
        // Handle cursor removal
        const aliveIds = new Set(args.slice(1).map(String));
        for (const [sid] of cursors) {
          if (!aliveIds.has(sid)) {
            cursors.delete(sid);
          }
        }
      }
    }
    return;
  }
  if (path === "/tuio2/obj") {
    if (typeof args[0] === "string") {
      const cmd = args[0];
      if (cmd === "set") {
        const s  = String(args[1]); const id=args[2];
        const x  = Number(args[3]); const y=Number(args[4]); const a=Number(args[5])||0;
        if (!Number.isNaN(x) && !Number.isNaN(y)) {
          const tag = { sid:s, id, x, y, angle:a };
          
          // Check if this is a new tag placement
          if (!objects.has(s)) {
            logTagDetails(tag);
          }
          
          objects.set(s, tag);
          // updateHUD();
          // updateTagReadings();
        }
      } else if (cmd === "alive") {
        // Handle object removal
        const aliveIds = new Set(args.slice(1).map(String));
        const removedTags = [];
        
        for (const [sid, tag] of objects) {
          if (!aliveIds.has(sid)) {
            removedTags.push(tag);
            objects.delete(sid);
          }
        }
        
        // Check if any removed tag was the active one
        if (removedTags.length > 0 && currentActiveTag) {
          const wasActiveTagRemoved = removedTags.some(tag => tag.id === currentActiveTag);
          if (wasActiveTagRemoved) {
            hideMainInterface();
            hideWebsiteOverlay(); // Close BrowserView when tag is removed
          }
        }
        
        // updateHUD();
        // updateTagReadings();
      }
    }
    return;
  }
}
function handleOsc(msg) {
  const path = msg.address;
  const args = (msg.args || []).map(a => a.value);
  setLast(path);
  if (path.startsWith("/tuio2/")) handleTuio2(path, args);
  else if (path.startsWith("/tuio/")) handleTuio1(path, args);
}
if (window.tuio?.onOsc) window.tuio.onOsc(handleOsc);