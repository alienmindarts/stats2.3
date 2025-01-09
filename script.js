// Load artist data from JSON files
let artistData = {};
let minPlays = 1000, maxPlays = 100000; // Reasonable defaults for play counts
let minRatio = Infinity, maxRatio = -Infinity;
const sortedDataCache = {};

async function loadArtistData() {
  console.log('Loading artist data...');
  
  // Fetch artist list from backend
  const artistResponse = await fetch('/api/artists');
  if (!artistResponse.ok) {
    throw new Error('Failed to fetch artist list');
  }
  const artistFiles = (await artistResponse.json()).map(artist => `${artist} stats.json`);
  
  for (const file of artistFiles) {
    console.log(`Fetching ${file}...`);
    const response = await fetch(`artists/${file}`);
    console.log(`Response status for ${file}:`, response.status);
    if (!response.ok) {
      throw new Error(`Failed to load ${file} - Status: ${response.status}`);
    }
    try {
      const data = await response.json();
      if (!data || typeof data !== 'object') {
        throw new Error(`Invalid JSON format in ${file}`);
      }
      
      // Verify expected fields
      if (!Array.isArray(data)) {
        throw new Error(`Expected an array of tracks in ${file}, but got ${typeof data}`);
      }
      // Filter out invalid tracks
      const validTracks = data.filter(track => {
        if (!track.Title || !track.Like || !track.scministats) {
          console.warn(`Skipping invalid track in ${file} - missing required fields`);
          return false;
        }
        return true;
      });
      
      if (validTracks.length === 0) {
        console.warn(`No valid tracks found in ${file}`);
        return;
      }

      const artistName = file.split(' ')[0].toUpperCase();
      artistData[artistName] = data;
    } catch (error) {
      console.error(`Error parsing JSON data from ${file}:`, error);
      throw new Error(`Failed to parse JSON data from ${file}`);
    }
  }
}

// Initialize app
async function initializeApp() {
  try {
    await loadArtistData();
  } catch (error) {
    console.error('Error loading artist data:', error);
    return;
  }

  // Create artist selection controls
  const artistControls = document.createElement('div');
  artistControls.id = 'artistControls';
  document.body.insertBefore(artistControls, document.getElementById('chartContainer'));

  Object.keys(artistData).forEach(artist => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `artist-${artist}`;
    checkbox.checked = true;

    const label = document.createElement('label');
    label.htmlFor = `artist-${artist}`;
    label.textContent = artist;
    label.title = `Toggle visibility of ${artist} data`;

    artistControls.appendChild(checkbox);
    artistControls.appendChild(label);
  });

  // Set up event listeners
  setupEventListeners('#artistControls input', 'change', updateChart);

  // Initial chart update
  updateChart();
}

// Helper function to get plays as number
const getPlays = (track) => {
  let plays = parseInt(track.scministats.replace(',', '').replace('K', '000'));
  if (track.Like > plays) {
    plays *= 1000;
  }
  return plays;
};

// Function to calculate average values for each artist and parameter
function calculateAverages(artistData, currentView) {
  const averages = {};
  for (const artist in artistData) {
    const data = artistData[artist];
    if (data && data.length > 0) {
      let sum = 0;
      for (const track of data) {
        sum += parseFloat(viewFunctions[currentView](track));
      }
      averages[artist] = (sum / data.length).toFixed(2);
    } else {
        averages[artist] = 0;
    }
  }
  return averages;
}

// Current view state
let currentView = 'ratio';
let currentSort = 'desc';
let comparisonMode = 'overlay'; // 'overlay' or 'side-by-side'
let chartType = 'bar'; // 'bar' or 'line'

// Data transformation functions
const getRatioData = (track) => {
  const plays = getPlays(track);
  return Math.round((track.Like / plays) * 10000) / 100; // Returns percentage with 2 decimal places
};

const getPlaysData = (track) => getPlays(track);
const getLikesData = (track) => track.Like;

// View and sort functions
const viewFunctions = {
  ratio: getRatioData,
  plays: getPlaysData,
  likes: getLikesData
};

const sortFunctions = {
  ratio: {
    asc: (a, b) => getRatioData(a) - getRatioData(b),
    desc: (a, b) => getRatioData(b) - getRatioData(a)
  },
  plays: {
    asc: (a, b) => getPlaysData(a) - getPlaysData(b),
    desc: (a, b) => getPlaysData(b) - getPlaysData(a)
  },
  likes: {
    asc: (a, b) => getLikesData(a) - getLikesData(b),
    desc: (a, b) => getLikesData(b) - getLikesData(a)
  }
};

// Initialize Plotly chart
let chart;
const chartDiv = document.getElementById('trackChart');
if (!chartDiv) {
  console.error('Chart div not found');
}

// Plotly chart layout
const layout = {
  title: {
    text: 'OKTA: Track Plays vs Likes Ratio',
    font: {
      family: 'Inter, system-ui, sans-serif',
      size: 20,
      weight: 600
    },
    x: 0.05,
    xanchor: 'left'
  },
  yaxis: {
    type: 'log',
    title: {
      text: 'Plays/Likes Ratio (%)',
      font: {
        size: 14,
        weight: 500
      }
    },
    automargin: true,
    gridcolor: 'var(--background)',
    showgrid: true,
    gridwidth: 1,
    zeroline: true,
    zerolinecolor: 'var(--background)',
    zerolinewidth: 2,
    tickfont: {
      size: 12
    },
    fixedrange: true,
    rangemode: 'normal',
    range: [Math.log10(Math.max(1, minRatio - (maxRatio - minRatio) * 0.05)), 
           Math.log10(maxRatio + (maxRatio - minRatio) * 0.05)]
  },
  xaxis: {
    title: {
      text: 'Plays (scministats) - log scale',
      font: {
        size: 14,
        weight: 500
      }
    },
    type: 'log',
    autorange: true,
    automargin: true,
    gridcolor: 'rgba(0,0,0,0.1)',
    showgrid: true,
    tickangle: 0,
    tickfont: {
      size: 12,
      color: 'var(--text-light)'
    },
    ticklen: 5,
    tickwidth: 1,
    hoverformat: '.2f',
    showspikes: true,
    spikethickness: 1,
    spikedash: 'dot',
    spikecolor: 'var(--text-light)',
    spikemode: 'across',
    spikesnap: 'data',
    zeroline: false
  },
  margin: { 
    t: 80, 
    b: 120, 
    l: 20, 
    r: 20 
  },
  showlegend: true,
  legend: {
    x: 1,
    xanchor: 'right',
    y: 1,
    yanchor: 'top',
    bgcolor: 'rgba(255,255,255,0.8)',
    bordercolor: 'rgba(0,0,0,0.1)',
    borderwidth: 1,
    font: {
      size: 12
    }
  },
  hovermode: 'closest',
  hoverlabel: {
    bgcolor: 'var(--surface)',
    bordercolor: 'var(--background)',
    font: {
      size: 12,
      color: 'var(--text)'
    }
  },
  paper_bgcolor: 'var(--surface)',
  plot_bgcolor: 'var(--surface)'
};

// Plotly chart config
const config = {
  responsive: true,
  displayModeBar: true
};

// Initialize empty chart
Plotly.newPlot(chartDiv, [], layout, config);

// Add click handler for chart
chartDiv.on('plotly_click', function(data) {
  if (data.points.length > 0) {
    const point = data.points[0];
    const artist = point.data.name;
    const trackIndex = point.pointNumber;
    showTrackDetails(artistData[artist][trackIndex]);
  }
});

// Update chart with current view and sort
function updateChart() {
  if (!chartDiv) {
    console.error('Chart div not found');
    return;
  }

  const loadingIndicator = document.getElementById('loadingIndicator');
  if (loadingIndicator) {
    loadingIndicator.style.display = 'block';
  }

  const selectedArtists = Array.from(document.querySelectorAll('#artistControls input:checked'))
    .map(input => input.id.replace('artist-', ''));

  // Create Plotly data
  // Combine tracks from all selected artists
  const allTracks = selectedArtists.flatMap(artist => 
    artistData[artist].map(track => ({
      ...track,
      artist
    }))
  );

  // Sort combined tracks by ratio score by default
  const sortedTracks = allTracks
    .map((track, index) => ({
      track,
      index,
      value: viewFunctions[currentView](track),
      ratio: getRatioData(track)
    }))
    .sort((a, b) => {
      // Always sort by ratio score first
      const ratioDiff = b.ratio - a.ratio;
      if (ratioDiff !== 0) return ratioDiff;
      
      // Then by plays as secondary sort
      const playsDiff = getPlays(b.track) - getPlays(a.track);
      if (playsDiff !== 0) return playsDiff;
      
      // Finally by likes as tertiary sort
      return b.track.Like - a.track.Like;
    });

  // Group sorted tracks back by artist
  const groupedTracks = selectedArtists.reduce((acc, artist) => {
    acc[artist] = sortedTracks.filter(t => t.track.artist === artist);
    return acc;
  }, {});

  // Calculate global min/max values
  let minPlays = Infinity, maxPlays = -Infinity;
  let minRatio = Infinity, maxRatio = -Infinity;
  
  selectedArtists.forEach(artist => {
    groupedTracks[artist].forEach(item => {
      const plays = getPlays(item.track);
      const ratio = getRatioData(item.track);
      if (plays > 0) { // Only consider positive play counts
        if (plays < minPlays) minPlays = plays;
        if (plays > maxPlays) maxPlays = plays;
      }
      if (ratio < minRatio) minRatio = ratio;
      if (ratio > maxRatio) maxRatio = ratio;
    });
  });

  // Generate distinct colors based on artist index
  const getArtistColor = (index) => {
    const colors = [
      '#1f77b4', '#ff7f0e', '#2ca02c', 
      '#d62728', '#9467bd', '#8c564b'
    ];
    return colors[index % colors.length];
  };

  const plotlyData = selectedArtists.map((artist, index) => {
    const artistTracks = groupedTracks[artist];
    
    const baseConfig = {
      x: artistTracks.map(item => getPlays(item.track)),
      y: artistTracks.map(item => getRatioData(item.track)),
      name: artist,
      marker: {
        color: getArtistColor(index),
        opacity: 0.8
      }
    };

    if (chartType === 'bar') {
      return {
        ...baseConfig,
        type: 'bar',
        marker: {
          ...baseConfig.marker,
          line: {
            width: 1,
            color: 'var(--surface)'
          }
        },
        customdata: artistTracks.map(item => ({
          title: item.track.Title,
          plays: getPlays(item.track),
          likes: item.track.Like,
          ratio: getRatioData(item.track)
        })),
        hovertemplate: `
          <b>${artist}</b><br>
          <b>%{customdata.title}</b><br>
          Plays: %{x:,.0f}<br>
          Likes: %{customdata.likes:,.0f}<br>
          Ratio: %{y:.2f}%<br>
          <extra></extra>
        `,
        hoverlabel: {
          bgcolor: 'var(--surface)',
          bordercolor: 'var(--background)',
          font: {
            size: 12,
            color: 'var(--text)'
          }
        }
      };
    } else if (chartType === 'line') {
      return {
        ...baseConfig,
        type: 'scatter',
        mode: 'lines+markers',
        line: {
          width: 2
        },
        marker: {
          ...baseConfig.marker,
          size: 8
        },
        customdata: artistTracks.map(item => ({
          title: item.track.Title,
          plays: getPlays(item.track),
          likes: item.track.Like,
          ratio: getRatioData(item.track)
        })),
        hovertemplate: `
          <b>${artist}</b><br>
          <b>%{customdata.title}</b><br>
          Plays: %{x:,.0f}<br>
          Likes: %{customdata.likes:,.0f}<br>
          Ratio: %{y:.2f}%<br>
          <extra></extra>
        `,
        hoverlabel: {
          bgcolor: 'var(--surface)',
          bordercolor: 'var(--background)',
          font: {
            size: 12,
            color: 'var(--text)'
          }
        }
      };
    } else {
      return {
        ...baseConfig,
        type: 'scatter',
        mode: 'markers',
        marker: {
          ...baseConfig.marker,
          size: artistTracks.map(item => Math.log(getPlays(item.track)) * 3),
          line: {
            width: 1,
            color: 'var(--surface)'
          }
        },
        customdata: artistTracks.map(item => ({
          title: item.track.Title,
          plays: getPlays(item.track),
          likes: item.track.Like,
          ratio: getRatioData(item.track)
        })),
        hovertemplate: `
          <b>${artist}</b><br>
          <b>%{customdata.title}</b><br>
          Plays: %{x:,.0f}<br>
          Likes: %{customdata.likes:,.0f}<br>
          Ratio: %{y:.2f}%<br>
          <extra></extra>
        `,
        hoverlabel: {
          bgcolor: 'var(--surface)',
          bordercolor: 'var(--background)',
          font: {
            size: 12,
            color: 'var(--text)'
          }
        }
      };
    }
  });

  // Update layout based on current view
  layout.yaxis.title = currentView === 'ratio' ? 'Plays/Likes Ratio (%)' :
    currentView === 'plays' ? 'Total Plays' : 'Total Likes';
  
  // Update x-axis to show track names in ratio order
  layout.xaxis.title = 'Tracks (sorted by ratio score)';
  
  // Update axes ranges based on actual data
  layout.xaxis.range = [Math.log10(minPlays * 0.98), Math.log10(maxPlays * 1.02)];
  layout.yaxis.range = [Math.max(0, minRatio - (maxRatio - minRatio) * 0.05), 
                       maxRatio + (maxRatio - minRatio) * 0.05];

  // Update the chart
  Plotly.react(chartDiv, plotlyData, layout, config).then(() => {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
      loadingIndicator.style.display = 'none';
    }
  });
}

// Helper function to calculate highlights
function calculateHighlights(data) {
  const highlights = {
    totalPlays: 0,
    popularTrack: '',
    maxPlays: 0,
    avgLikes: 0,
    recentActivity: ''
  };
  
  let totalLikes = 0;
  let trackCount = 0;
  let mostRecentDate = new Date(0);
  
  // Process data for each artist
  const selectedArtists = Array.from(document.querySelectorAll('#artistControls input:checked'))
    .map(input => input.id.replace('artist-', ''));
    
  selectedArtists.forEach(artist => {
    data[artist].forEach(track => {
      const plays = getPlays(track);
      const likes = track.Like;
      
      // Total plays
      highlights.totalPlays += plays;
      
      // Most popular track
      if (plays > highlights.maxPlays) {
        highlights.maxPlays = plays;
        highlights.popularTrack = track.Title;
      }
      
      // Total likes for average
      totalLikes += likes;
      trackCount++;
      
      // Recent activity
      const trackDate = new Date(track.Date);
      if (trackDate > mostRecentDate) {
        mostRecentDate = trackDate;
        highlights.recentActivity = trackDate.toLocaleDateString();
      }
    });
  });
  
  // Calculate average likes
  highlights.avgLikes = totalLikes / trackCount;
  
  return highlights;
}

// Format number with commas
function formatNumber(num) {
  return num.toLocaleString();
}

// Set up event listeners for view buttons
setupEventListeners('.view-button', 'click', function() {
  document.querySelectorAll('.view-button').forEach(btn => btn.classList.remove('active'));
  this.classList.add('active');
  currentView = this.dataset.view;
  updateChart();
});

// Set up event listeners for sort buttons
setupEventListeners('#sort-asc', 'click', function() {
  currentSort = 'asc';
  updateChart();
});

setupEventListeners('#sort-desc', 'click', function() {
  currentSort = 'desc';
  updateChart();
});

// Set up event listeners for chart type buttons
setupEventListeners('.chart-type-button', 'click', function() {
  document.querySelectorAll('.chart-type-button').forEach(btn => btn.classList.remove('active'));
  this.classList.add('active');
  chartType = this.dataset.type;
  
  // Update dataset styles based on chart type
  if (chart && chart.data && chart.data.datasets) {
    chart.data.datasets.forEach(dataset => {
      if (chartType === 'line') {
        dataset.borderWidth = 2;
        dataset.pointRadius = 4;
        dataset.pointHoverRadius = 6;
        dataset.fill = false;
      } else {
        dataset.borderWidth = 1;
        dataset.borderRadius = 4;
      }
    });
  }
  updateChart();
});

// Set up event listeners for comparison buttons
setupEventListeners('.comparison-button', 'click', function() {
  document.querySelectorAll('.comparison-button').forEach(btn => btn.classList.remove('active'));
  this.classList.add('active');
  comparisonMode = this.dataset.mode;
  
  // Update chart based on comparison mode
  if (comparisonMode === 'overlay') {
    layout.barmode = 'group';
    layout.xaxis.showgrid = true;
    layout.yaxis.showgrid = true;
  } else {
    layout.barmode = 'stack';
    layout.xaxis.showgrid = true;
    layout.yaxis.showgrid = true;
  }
  
  updateChart();
});

// Helper function to set up event listeners
function setupEventListeners(selector, event, callback) {
  document.querySelectorAll(selector).forEach(element => {
    element.addEventListener(event, callback);
  });
}

// Start the app
initializeApp();

// Watch for new artist files
async function watchForNewArtists() {
  const chokidar = require('chokidar');

  const watcher = chokidar.watch('artists', {
    persistent: true,
    ignoreInitial: true
  });

  watcher.on('change', async (path) => {
    try {
      const artistResponse = await fetch('/api/artists');
      if (!artistResponse.ok) return;
      
      const currentArtists = Object.keys(artistData);
      const newArtists = (await artistResponse.json())
       .filter(artist =>!currentArtists.includes(artist.toUpperCase()));
        
      if (newArtists.length > 0) {
        await loadArtistData();
        updateChart();
      }
    } catch (error) {
      console.error('Error checking for new artists:', error);
    }
  });
}
