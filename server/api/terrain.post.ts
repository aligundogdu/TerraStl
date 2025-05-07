import { defineEventHandler, readBody, setResponseStatus } from 'h3';

// Define a type for the expected request body from the client
interface TerrainRequestBody {
  locationsString: string;
  interpolation?: 'nearest' | 'bilinear' | 'cubic';
  dataset?: string; // Optional: allow client to specify dataset
}

// Define a type for the OpenTopoData API response for a single elevation result
interface OpenTopoElevationResult {
  dataset: string;
  elevation: number | null;
  location: {
    lat: number;
    lng: number;
  };
}

// Define a type for the overall OpenTopoData API success response
interface OpenTopoSuccessResponse {
  results: OpenTopoElevationResult[];
  status: 'OK';
}

// Define a type for the OpenTopoData API error response
interface OpenTopoErrorResponse {
  error: string;
  status: string; // e.g., 'INVALID_REQUEST'
}

const MAX_LOCATIONS_PER_REQUEST = 100;
const DELAY_BETWEEN_BATCHES_MS = 1000; // 1 second delay

// Helper function for creating a delay
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default defineEventHandler(async (event) => {
  const body = await readBody<TerrainRequestBody>(event);

  const locationsString = body.locationsString;
  const interpolation = body.interpolation || 'bilinear';
  const dataset = body.dataset || 'srtm90m';

  if (!locationsString) {
    setResponseStatus(event, 400);
    return { error: 'Missing locationsString in request body' };
  }

  const allLocationPoints = locationsString.split('|');
  const totalPoints = allLocationPoints.length;
  const totalBatches = Math.ceil(totalPoints / MAX_LOCATIONS_PER_REQUEST);
  console.log(`Server: Received request for ${totalPoints} points. Will be processed in ${totalBatches} batches. Max per batch: ${MAX_LOCATIONS_PER_REQUEST}`);

  const openTopoApiUrl = `https://api.opentopodata.org/v1/${dataset}`;
  const allResults: OpenTopoElevationResult[] = [];

  try {
    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
      const startIndex = batchNum * MAX_LOCATIONS_PER_REQUEST;
      const endIndex = startIndex + MAX_LOCATIONS_PER_REQUEST;
      const batchLocations = allLocationPoints.slice(startIndex, endIndex);
      const batchLocationsString = batchLocations.join('|');
      
      console.log(`Server: Processing batch ${batchNum + 1} of ${totalBatches}, ${batchLocations.length} points.`);

      // Add delay before making the API call, but not for the very first batch
      if (batchNum > 0) {
        console.log(`Server: Delaying for ${DELAY_BETWEEN_BATCHES_MS}ms before next batch...`);
        await delay(DELAY_BETWEEN_BATCHES_MS);
      }

      const responseFromTopoBatch = await $fetch<OpenTopoSuccessResponse | OpenTopoErrorResponse>(openTopoApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'MapToSTLApp/1.0 (Nuxt Server Proxy via POST - Batched with Delay)',
        },
        body: {
          locations: batchLocationsString,
          interpolation: interpolation,
        },
      });

      if ('error' in responseFromTopoBatch || responseFromTopoBatch.status !== 'OK') {
        const errorData = responseFromTopoBatch as OpenTopoErrorResponse;
        console.error('Server: OpenTopoData API returned an error for a batch:', errorData);
        setResponseStatus(event, 502); 
        return { 
          error: `Error from OpenTopoData for batch ${batchNum + 1}: ${errorData.error || 'Unknown API error'}`, 
          details: JSON.stringify(errorData) 
        };
      }
      
      if (responseFromTopoBatch.results && Array.isArray(responseFromTopoBatch.results)) {
        allResults.push(...responseFromTopoBatch.results);
      }
    }

    console.log(`Server: Successfully fetched ${allResults.length} elevation points in ${totalBatches} batches.`);
    return { results: allResults, status: 'OK' };

  } catch (error: any) {
    console.error('Server: Error proxying OpenTopoData POST request (batched with delay):', error);
    
    let statusCode = 500;
    let message = 'Failed to fetch data from OpenTopoData via batched POST proxy with delay.';
    let errorDetails = error.toString();

    if (error.response) { 
      statusCode = error.response.status || 500;
      const responseData = error.response._data;
      if (typeof responseData === 'string') {
        message = responseData;
      } else if (responseData && (responseData.error || responseData.message)) {
        message = responseData.error || responseData.message;
      } else if (error.message) {
        message = error.message;
      }
      errorDetails = JSON.stringify(responseData) || errorDetails;
      console.error('Server: OpenTopoData API error details (from $fetch error.response):', responseData);
    } else if (error.data) { 
        const responseData = error.data;
        if (typeof responseData === 'string') {
            message = responseData;
        } else if (responseData && (responseData.error || responseData.message)) {
            message = responseData.error || responseData.message;
        }
        errorDetails = JSON.stringify(responseData) || errorDetails;
        console.error('Server: OpenTopoData API error details (from error.data):', responseData);
    } else {
      message = error.message || message;
    }
    
    setResponseStatus(event, statusCode);
    return { error: message, details: errorDetails };
  }
}); 