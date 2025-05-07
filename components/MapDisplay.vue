<template>
  <div ref="mapContainer" class="map-container"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import 'ol/ol.css'; // OpenLayers CSS
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { fromLonLat, toLonLat, transformExtent } from 'ol/proj';
import Feature from 'ol/Feature';
// import Point from 'ol/geom/Point'; // Kullanılmıyorsa kaldırılabilir
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Style, Stroke, Fill } from 'ol/style';
import { Modify, Translate } from 'ol/interaction'; // Translate eklendi
// import {platformModifierKeyOnly} from 'ol/events/condition'; // Kullanılmıyorsa kaldırılabilir
import Polygon from 'ol/geom/Polygon';
import { getCenter } from 'ol/extent';
import Collection from 'ol/Collection'; // Translate interaction için Collection importu

import { REAL_WORLD_WIDTH_KM, REAL_WORLD_HEIGHT_KM } from '~/config/constants'; // SELECTION_ASPECT_RATIO kaldırıldı, çünkü gerçek dünya boyutları öncelikli

const props = defineProps({
  // initialCenter: { type: Array, default: () => [0, 0] }, // [lon, lat]
  // initialZoom: { type: Number, default: 10 }
});

const emit = defineEmits(['area-updated']);

const mapContainer = ref(null);
let map = null;
let selectionFeature = null;
let vectorSource = null;
// let modifyInteraction = null; // Modify yerine Translate kullanılıyor

const toGeographic = (coordinate) => toLonLat(coordinate);
const fromGeographic = (coordinate) => fromLonLat(coordinate);
const kmToMeters = (km) => km * 1000;

const createSelectionRectangle = (centerCoordinates) => {
  const realWidthMeters = kmToMeters(REAL_WORLD_WIDTH_KM);
  const realHeightMeters = kmToMeters(REAL_WORLD_HEIGHT_KM);

  const halfWidth = realWidthMeters / 2;
  const halfHeight = realHeightMeters / 2;

  const minX = centerCoordinates[0] - halfWidth;
  const minY = centerCoordinates[1] - halfHeight;
  const maxX = centerCoordinates[0] + halfWidth;
  const maxY = centerCoordinates[1] + halfHeight;

  const rectangleCoordinates = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY]
  ];

  return new Polygon([rectangleCoordinates]);
};

onMounted(() => {
  if (!mapContainer.value) return;

  const initialMapCenter = fromGeographic([28.9784, 41.0082]); // İstanbul merkezi
  const initialZoom = 10; // Daha yakın bir zoom seviyesi

  vectorSource = new VectorSource();
  const vectorLayer = new VectorLayer({
    source: vectorSource,
    style: new Style({
      fill: new Fill({
        color: 'rgba(255, 255, 255, 0.3)'
      }),
      stroke: new Stroke({
        color: '#ffcc33',
        width: 3
      })
    })
  });

  map = new Map({
    target: mapContainer.value,
    layers: [
      new TileLayer({
        source: new OSM()
      }),
      vectorLayer
    ],
    view: new View({
      center: initialMapCenter, // Haritanın başlangıç merkezi
      zoom: initialZoom,
      projection: 'EPSG:3857'
    }),
  });

  // Haritanın merkezine göre seçim dikdörtgenini oluştur
  const viewCenter = map.getView().getCenter();
  const selectionGeom = createSelectionRectangle(viewCenter);
  selectionFeature = new Feature({
    geometry: selectionGeom
  });
  vectorSource.addFeature(selectionFeature);

  // Dikdörtgeni sürüklemek için Translate interaction
  const translateInteraction = new Translate({
    features: new Collection([selectionFeature]) // Sadece bu feature'ı sürükle
  });

  map.addInteraction(translateInteraction);

  translateInteraction.on('translateend', () => {
    if (selectionFeature) {
        const geometry = selectionFeature.getGeometry();
        if (geometry) {
            const extent = geometry.getExtent();
            const geographicExtent = transformExtent(extent, 'EPSG:3857', 'EPSG:4326');
            const centerOfExtent = getCenter(extent); // Harita koordinatlarında merkez
            const geographicCenter = toGeographic(centerOfExtent); // Coğrafi koordinatlarda merkez

            console.log('Selection new extent (geo):', geographicExtent);
            emit('area-updated', {
                extent: geographicExtent,
                center: geographicCenter,
                realWorldWidthKM: REAL_WORLD_WIDTH_KM,
                realWorldHeightKM: REAL_WORLD_HEIGHT_KM
            });
        }
    }
  });

  // İlk alan güncellemesini gönder
    const initialExtent = selectionFeature.getGeometry().getExtent();
    const initialGeographicExtent = transformExtent(initialExtent, 'EPSG:3857', 'EPSG:4326');
    const initialCenterGeo = toGeographic(getCenter(initialExtent));
    emit('area-updated', {
        extent: initialGeographicExtent,
        center: initialCenterGeo,
        realWorldWidthKM: REAL_WORLD_WIDTH_KM,
        realWorldHeightKM: REAL_WORLD_HEIGHT_KM
    });

});

onUnmounted(() => {
  if (map) {
    map.setTarget(null);
    map = null;
  }
});

const updateMapViewToSelection = (centerLonLat) => {
  if (!map || !selectionFeature) return;

  const newMapCenter = fromGeographic(centerLonLat);
  map.getView().setCenter(newMapCenter);

  const newSelectionGeom = createSelectionRectangle(newMapCenter);
  selectionFeature.setGeometry(newSelectionGeom);

  const extent = newSelectionGeom.getExtent();
  const geographicExtent = transformExtent(extent, 'EPSG:3857', 'EPSG:4326');
  emit('area-updated', {
    extent: geographicExtent,
    center: centerLonLat,
    realWorldWidthKM: REAL_WORLD_WIDTH_KM,
    realWorldHeightKM: REAL_WORLD_HEIGHT_KM
  });
};

defineExpose({
  updateMapViewToSelection
});

</script>

<style scoped>
.map-container {
  width: 100%;
  height: 500px; /* Varsayılan yükseklik, üst bileşen tarafından ezilebilir */
  background-color: #eee;
  border: 1px solid #ccc;
}
</style> 