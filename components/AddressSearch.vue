<template>
  <div class="address-search" ref="addressSearchComponent">
    <input
      type="text"
      v-model="searchQuery"
      @input="debouncedSearch"
      @focus="handleInputFocus"
      placeholder="Adres girin (örn: Eyfel Kulesi Paris)"
    />
    <button @click="performSearch" :disabled="isLoading || !searchQuery.trim()">
      {{ isLoading ? 'Aranıyor...' : 'Ara' }}
    </button>
    <ul v-if="results.length > 0 && showResults" class="results-list">
      <li
        v-for="result in results"
        :key="result.place_id"
        @click="selectLocation(result)"
      >
        {{ result.display_name }}
      </li>
    </ul>
    <p v-if="error" class="error-message">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const emit = defineEmits(['location-selected']);

const searchQuery = ref('');
const results = ref([]);
const isLoading = ref(false);
const error = ref(null);
const showResults = ref(false);
const addressSearchComponent = ref(null); // Bileşenin kendisine referans

let debounceTimer = null;

const handleInputFocus = () => {
  // Eğer input boş değilse ve daha önce sonuçlar varsa, tekrar göster
  if (searchQuery.value.trim() && results.value.length > 0) {
    showResults.value = true;
  }
};

const debouncedSearch = () => {
  clearTimeout(debounceTimer);
  if (!searchQuery.value.trim()) {
    results.value = [];
    showResults.value = false;
    error.value = null;
    return;
  }
  debounceTimer = setTimeout(() => {
    performSearch();
  }, 700);
};

async function performSearch() {
  if (!searchQuery.value.trim()) {
    results.value = [];
    showResults.value = false;
    error.value = null;
    return;
  }

  isLoading.value = true;
  error.value = null;
  // results.value = []; // Arama yaparken önceki sonuçları hemen temizleme, kullanıcıya daha iyi bir deneyim sunabilir

  try {
    const encodedQuery = encodeURIComponent(searchQuery.value);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&limit=5&addressdetails=1`, // addressdetails=1 eklendi
      {
        headers: {
          'User-Agent': 'MapToSTLApp/1.0 (iletisim@example.com)' // Genel bir e-posta
        }
      }
    );

    if (!response.ok) {
      throw new Error(`API hatası: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data && data.length > 0) {
      results.value = data;
      showResults.value = true;
    } else {
      error.value = 'Adres bulunamadı.';
      results.value = []; // Sonuç yoksa temizle
      showResults.value = false;
    }
  } catch (err) {
    console.error('Adres arama hatası:', err);
    error.value = `Arama sırasında bir hata oluştu. Lütfen internet bağlantınızı kontrol edin veya daha sonra tekrar deneyin.`;
    results.value = [];
    showResults.value = false;
  } finally {
    isLoading.value = false;
  }
}

function selectLocation(location) {
  console.log('Seçilen konum (AddressSearch):', location);
  emit('location-selected', {
    lon: parseFloat(location.lon),
    lat: parseFloat(location.lat),
    displayName: location.display_name,
  });
  searchQuery.value = location.display_name;
  results.value = [];
  showResults.value = false;
  error.value = null;
}

const handleClickOutside = (event) => {
  if (addressSearchComponent.value && !addressSearchComponent.value.contains(event.target)) {
    showResults.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside, true); // Use capture phase
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside, true);
  clearTimeout(debounceTimer);
});

</script>

<style scoped>
.address-search {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  position: relative;
  margin-bottom: 1rem;
}

.address-search input[type="text"] {
  padding: 0.75rem; /* Biraz daha büyük padding */
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
  box-sizing: border-box; /* Padding ve border width'i etkilemesin */
}

.address-search button {
  padding: 0.75rem 1rem;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

.address-search button:disabled {
  background-color: #aaa;
  cursor: not-allowed;
}

.results-list {
  list-style: none;
  padding: 0;
  margin: 0;
  border: 1px solid #ddd; /* Daha yumuşak border */
  border-radius: 4px; /* Input ile aynı border-radius */
  max-height: 250px; /* Biraz daha yüksek */
  overflow-y: auto;
  position: absolute;
  background-color: white;
  width: 100%;
  top: calc(100% + 5px); /* Inputtan biraz aşağıda başlasın */
  left: 0;
  z-index: 1000;
  box-shadow: 0 6px 12px rgba(0,0,0,0.15); /* Daha belirgin gölge */
  box-sizing: border-box;
}

.results-list li {
  padding: 0.85rem 1rem; /* Daha ferah itemler */
  cursor: pointer;
  border-bottom: 1px solid #eee;
  font-size: 0.95rem; /* Biraz daha büyük font */
}

.results-list li:last-child {
  border-bottom: none;
}

.results-list li:hover {
  background-color: #f5f5f5; /* Daha açık hover rengi */
}

.error-message {
  color: #d9534f; /* Bootstrap danger color */
  font-size: 0.9rem;
  padding: 0.5rem;
  background-color: #f2dede; /* Hata mesajı arkaplanı */
  border: 1px solid #ebccd1;
  border-radius: 4px;
}
</style> 