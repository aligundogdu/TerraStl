<template>
  <div class="container">
    <header>
      <h1>Haritadan 3D Model Oluşturucu</h1>
    </header>
    <main>
      <div class="map-section">
        <AddressSearch @location-selected="handleLocationSelectedFromSearch" />
        <MapDisplay ref="mapDisplayRef" @area-updated="handleAreaUpdated" />
        <div v-if="selectedAreaInfo">
          Seçili Alan Merkezi: {{ selectedAreaInfo.center[0].toFixed(4) }}, {{ selectedAreaInfo.center[1].toFixed(4) }}<br>
          Genişlik: {{ selectedAreaInfo.realWorldWidthKM }} km, Yükseklik: {{ selectedAreaInfo.realWorldHeightKM }} km
        </div>
      </div>
      <div class="preview-section">
        <Preview3D 
          :terrain-data="terrainData" 
          :config="stlConfig" 
          :is-loading-props="isRendering"
          ref="preview3DRef"
        />
        <div class="controls">
          <button @click="handleRender" :disabled="isRendering || !selectedArea">
            {{ isRendering ? 'Render Ediliyor...' : 'Render Et' }}
          </button>
          <button @click="handleDownloadSTL" :disabled="!isRendered || isRendering">
            STL İndir
          </button>
          <div class="control-item">
            <label for="verticalScale">Dikey Ölçek: {{ stlConfig.verticalScale.toFixed(1) }}x</label>
            <input type="range" id="verticalScale" min="0.1" max="5" step="0.1" v-model.number="stlConfig.verticalScale">
          </div>
          <div class="control-item">
            <label for="gridResolution">Detay (Grid: {{ gridResolution }}x{{ gridResolution }}):</label>
            <input type="number" id="gridResolution" min="2" max="100" step="1" v-model.number="gridResolution">
            <span>(Max 2-100 önerilir, POST ile limit yok)</span>
          </div>
        </div>
        <p v-if="renderError" class="error-message">Render Hatası: {{ renderError }}</p>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';
import MapDisplay from '~/components/MapDisplay.vue';
import AddressSearch from '~/components/AddressSearch.vue';
import Preview3D from '~/components/Preview3D.vue';
import { 
  REAL_WORLD_WIDTH_KM, 
  REAL_WORLD_HEIGHT_KM, 
  STL_TARGET_WIDTH_MM, 
  STL_TARGET_HEIGHT_MM, 
  TERRAIN_BASE_HEIGHT_MM, 
  WATER_BASE_HEIGHT_MM, 
  INITIAL_TERRAIN_VERTICAL_SCALE 
} from '~/config/constants';

const selectedArea = ref(null);
const selectedAreaInfo = ref(null);
const terrainData = ref(null);
const isRendered = ref(false);
const isRendering = ref(false);
const renderError = ref(null);

const mapDisplayRef = ref(null);
const preview3DRef = ref(null);
const gridResolution = ref(20);

const stlConfig = reactive({
  targetWidthMM: STL_TARGET_WIDTH_MM,
  targetHeightMM: STL_TARGET_HEIGHT_MM,
  baseHeightMM: TERRAIN_BASE_HEIGHT_MM,
  waterBaseHeightMM: WATER_BASE_HEIGHT_MM,
  verticalScale: INITIAL_TERRAIN_VERTICAL_SCALE,
});

function handleLocationSelectedFromSearch(locationDetails) {
  console.log('Ana sayfada arama ile seçilen konum:', locationDetails);
  if (mapDisplayRef.value && locationDetails && typeof locationDetails.lon === 'number' && typeof locationDetails.lat === 'number') {
    mapDisplayRef.value.updateMapViewToSelection([locationDetails.lon, locationDetails.lat]);
    terrainData.value = null;
    isRendered.value = false;
  }
}

function handleAreaUpdated(area) {
  console.log('Ana sayfada güncellenen alan:', area);
  selectedArea.value = area;
  selectedAreaInfo.value = {
    center: area.center,
    realWorldWidthKM: area.realWorldWidthKM,
    realWorldHeightKM: area.realWorldHeightKM
  };
  isRendered.value = false;
  terrainData.value = null;
}

async function handleRender() {
  if (!selectedArea.value || !selectedArea.value.extent) {
    alert('Lütfen önce haritadan bir alan seçin.');
    return;
  }
  if (gridResolution.value < 2 || gridResolution.value > 100) {
      alert('Grid çözünürlüğü 2 ile 100 arasında olmalıdır.');
      return;
  }

  isRendering.value = true;
  isRendered.value = false;
  renderError.value = null;
  terrainData.value = null;

  console.log('Render başlatılıyor için alan:', selectedArea.value.extent, 'Çözünürlük:', gridResolution.value);

  const currentExtent = selectedArea.value.extent;
  const currentRealWorldWidthKM = selectedArea.value.realWorldWidthKM;
  const currentRealWorldHeightKM = selectedArea.value.realWorldHeightKM;

  const gridRows = gridResolution.value;
  const gridCols = gridResolution.value;
  
  try {
    const locations = [];
    const minLon = currentExtent[0];
    const minLat = currentExtent[1];
    const maxLon = currentExtent[2];
    const maxLat = currentExtent[3];

    for (let i = 0; i < gridRows; i++) {
      const lat = minLat + (i / (gridRows - 1)) * (maxLat - minLat);
      for (let j = 0; j < gridCols; j++) {
        const lon = minLon + (j / (gridCols - 1)) * (maxLon - minLon);
        locations.push(`${lat.toFixed(6)},${lon.toFixed(6)}`);
      }
    }
    const locationsString = locations.join('|');
    const terrainApiUrl = '/api/terrain';

    console.log(`Client: Requesting Terrain Data (POST ${terrainApiUrl}) for ${locations.length} points.`);
    const terrainResponse = await fetch(terrainApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ locationsString: locationsString })
    });

    if (!terrainResponse.ok) {
      let errorMsg = terrainResponse.statusText;
      try { const errData = await terrainResponse.json(); errorMsg = errData.error || errData.message || errData.details || errorMsg; } catch (e) { /* ignore */ }
      throw new Error(`Terrain API Error: ${terrainResponse.status} - ${errorMsg}`);
    }
    const terrainApiData = await terrainResponse.json();
    if (terrainApiData.error) {
      throw new Error(`Terrain API Error: ${terrainApiData.error} ${terrainApiData.details ? '- ' + terrainApiData.details : ''}`);
    }

    if (terrainApiData.results && terrainApiData.results.length > 0) {
      const elevations = terrainApiData.results.map(r => r.elevation);
      terrainData.value = {
        elevations: elevations,
        rows: gridRows,
        cols: gridCols,
        extent: currentExtent,
        realWorldWidthKM: currentRealWorldWidthKM,
        realWorldHeightKM: currentRealWorldHeightKM
      };
      console.log('Arazi verisi başarıyla alındı:', terrainData.value);
      alert('Arazi verisi başarıyla alındı ve render için hazır.');
    } else {
      throw new Error('No valid elevation data received from Terrain API.');
    }

    isRendered.value = true;

  } catch (mainErr) {
    console.error('Client: Hata oluştu (handleRender):', mainErr);
    renderError.value = mainErr.message;
    terrainData.value = null;
    alert(`Arazi verisi alınırken hata oluştu: ${mainErr.message}`);
  } finally {
    isRendering.value = false;
  }
}

async function handleDownloadSTL() {
  if (!isRendered.value || !terrainData.value || !preview3DRef.value) {
    alert('Lütfen önce alanı render edin ve modelin yüklenmesini bekleyin.');
    return;
  }
  console.log('STL indirme işlemi başlatılıyor.');
  
  const stlDataArrayBuffer = preview3DRef.value.exportSTL(); 
  
  if (stlDataArrayBuffer) {
    const blob = new Blob([stlDataArrayBuffer], { type: 'application/sla' }); // MIME type for STL
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    // Generate a filename with a timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.download = `terrain_model_${timestamp}.stl`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    alert('STL dosyası başarıyla oluşturuldu ve indirme başlatıldı.');
  } else {
    alert('STL verisi oluşturulamadı. Lütfen modelin doğru render edildiğinden emin olun.');
  }
}
</script>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  font-family: sans-serif;
}
header {
  padding: 1rem;
  background-color: #f0f0f0;
  text-align: center;
}
main {
  display: flex;
  flex-grow: 1;
}
.map-section {
  flex: 2;
  padding: 1rem;
  border-right: 1px solid #ccc;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.preview-section {
  flex: 1;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.preview-section > .controls {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
}
.preview-section > .controls > button {
  flex-grow: 1;
}
.preview-section > .controls > label {
  margin-left: 0.5rem;
}
.preview-section > .controls > input[type="range"] {
  flex-grow: 2;
  max-width: 200px;
}
:deep(.preview-container) {
  flex-grow: 1;
}
button {
  padding: 0.5rem 1rem;
  cursor: pointer;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.error-message {
  color: red;
  font-size: 0.9em;
  margin-top: 5px;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
}

.control-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.control-item label {
  font-size: 0.9em;
  color: #333;
}

.control-item input[type="range"],
.control-item input[type="number"] {
  padding: 0.25rem;
  max-width: 180px; 
}

.control-item span {
    font-size: 0.8em;
    color: #666;
}
</style> 