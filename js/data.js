/* Data layer for HarvestV. Crops and rotation sequences come from the API; the remaining mock data below
   (farm profile defaults, demo environment, what-if text, placeholder references) is DEMONSTRATION data. */
/* Crop catalog cache. Filled from GET /api/crops by getCropData(). There is no local copy of the catalog:
   the SQLite database behind the API is the only source of crop data. */
let cropData = [];
// District-town coordinates [latitude, longitude], not district boundaries.
// Source: https://github.com/ifahimreza/bangladesh-geojson/blob/master/src/data/bd-districts.json
const locations = {
  "Bagerhat": [22.651568, 89.785938],
  "Bandarban": [22.1953275, 92.2183773],
  "Barguna": [22.0953, 90.1121],
  "Barishal": [22.701, 90.3535],
  "Bhola": [22.685923, 90.648179],
  "Bogura": [24.8465228, 89.377755],
  "Brahmanbaria": [23.9570904, 91.1119286],
  "Chandpur": [23.2332585, 90.6712912],
  "Chapainawabganj": [24.5965034, 88.2775122],
  "Chattogram": [22.335109, 91.834073],
  "Chuadanga": [23.6401961, 88.841841],
  "Cox's Bazar": [21.4272, 92.0058],
  "Cumilla": [23.4682747, 91.1788135],
  "Dhaka": [23.7115253, 90.4111451],
  "Dinajpur": [25.6217061, 88.6354504],
  "Faridpur": [23.6070822, 89.8429406],
  "Feni": [23.0159, 91.3976],
  "Gaibandha": [25.328751, 89.528088],
  "Gazipur": [24.0022858, 90.4264283],
  "Gopalganj": [23.0050857, 89.8266059],
  "Habiganj": [24.374945, 91.41553],
  "Jamalpur": [24.937533, 89.937775],
  "Jashore": [23.16643, 89.2081126],
  "Jhalokati": [22.6406, 90.1987],
  "Jhenaidah": [23.5448176, 89.1539213],
  "Joypurhat": [25.0968, 89.0227],
  "Khagrachhari": [23.119285, 91.984663],
  "Khulna": [22.815774, 89.568679],
  "Kishoreganj": [24.444937, 90.776575],
  "Kurigram": [25.805445, 89.636174],
  "Kushtia": [23.901258, 89.120482],
  "Lakshmipur": [22.942477, 90.841184],
  "Lalmonirhat": [25.9923, 89.2847],
  "Madaripur": [23.164102, 90.1896805],
  "Magura": [23.487337, 89.419956],
  "Manikganj": [23.8644, 90.0047],
  "Meherpur": [23.762213, 88.631821],
  "Moulvibazar": [24.482934, 91.777417],
  "Munshiganj": [23.5422, 90.5305],
  "Mymensingh": [24.7471, 90.4203],
  "Naogaon": [24.7936, 88.9318],
  "Narail": [23.172534, 89.512672],
  "Narayanganj": [23.63366, 90.496482],
  "Narsingdi": [23.932233, 90.71541],
  "Natore": [24.420556, 89.000282],
  "Netrokona": [24.870955, 90.727887],
  "Nilphamari": [25.931794, 88.856006],
  "Noakhali": [22.869563, 91.099398],
  "Pabna": [23.998524, 89.233645],
  "Panchagarh": [26.3411, 88.5541606],
  "Patuakhali": [22.3596316, 90.3298712],
  "Pirojpur": [22.5841, 89.972],
  "Rajbari": [23.7574305, 89.6444665],
  "Rajshahi": [24.3745, 88.6042],
  "Rangamati": [22.7324, 92.2985],
  "Rangpur": [25.7558096, 89.244462],
  "Satkhira": [22.7185, 89.0705],
  "Shariatpur": [23.2423, 90.4348],
  "Sherpur": [25.0204933, 90.0152966],
  "Sirajganj": [24.4533978, 89.7006815],
  "Sunamganj": [25.0658042, 91.3950115],
  "Sylhet": [24.8897956, 91.8697894],
  "Tangail": [24.2513, 89.9167],
  "Thakurgaon": [26.0336945, 88.4616834]
};
// Administrative grouping: https://bangladesh.gov.bd/views/district-list
const districtsByDivision = {
  "Barishal": ["Barguna", "Barishal", "Bhola", "Jhalokati", "Patuakhali", "Pirojpur"],
  "Chattogram": ["Bandarban", "Brahmanbaria", "Chandpur", "Chattogram", "Cox's Bazar", "Cumilla", "Feni", "Khagrachhari", "Lakshmipur", "Noakhali", "Rangamati"],
  "Dhaka": ["Dhaka", "Faridpur", "Gazipur", "Gopalganj", "Kishoreganj", "Madaripur", "Manikganj", "Munshiganj", "Narayanganj", "Narsingdi", "Rajbari", "Shariatpur", "Tangail"],
  "Khulna": ["Bagerhat", "Chuadanga", "Jashore", "Jhenaidah", "Khulna", "Kushtia", "Magura", "Meherpur", "Narail", "Satkhira"],
  "Mymensingh": ["Jamalpur", "Mymensingh", "Netrokona", "Sherpur"],
  "Rajshahi": ["Bogura", "Chapainawabganj", "Joypurhat", "Naogaon", "Natore", "Pabna", "Rajshahi", "Sirajganj"],
  "Rangpur": ["Dinajpur", "Gaibandha", "Kurigram", "Lalmonirhat", "Nilphamari", "Panchagarh", "Rangpur", "Thakurgaon"],
  "Sylhet": ["Habiganj", "Moulvibazar", "Sunamganj", "Sylhet"]
};
const defaultFarm = {location:'Rangpur, Bangladesh',size:'1.0',crop:'Rice',previous:'Rice',irrigation:'Limited',priority:'Water efficiency',soil:'Clay loam'};
/* DEV ONLY: demo environmental data in the same shape as the API response. Used only when
   HARVESTV_CONFIG.useMockEnvironment is true and always labelled as demo data, never as NASA. */
const mockEnvironmentalApiResponse = {location:{latitude:25.75,longitude:89.25},weather:{temperature:29,rainfall:42,rainfall_days:7,solar_radiation:18.2,solar_radiation_units:'MJ/m²/day',data_date:'demo'},soil:{moisture:null},vegetation:{ndvi:null},sources:{weather:'Demo data (not NASA)',soil:null,vegetation:null}};
const whatIfScenarios = [{name:'Normal rainfall',water:0,note:'Baseline conditions.'},{name:'Lower rainfall',water:1,note:'Water-hungry crops face more stress.'},{name:'Higher temperature',water:0.5,note:'Heat can shorten planting windows for cool-season crops.'},{name:'Limited irrigation',water:1,note:'Needs reliable irrigation for later stages.'}];
const demoReferences = ['Placeholder: regional crop-rotation study A (fictional)','Placeholder: pulse nitrogen contribution review (fictional)','Placeholder: cereal water-use comparison (fictional)'];
/* Swap each body for fetch('/api/...').then(r=>r.json()) when the Python API exists. */
const delay=(v,ms=120)=>new Promise(r=>setTimeout(()=>r(v),ms));
const getFarmData=()=>delay(JSON.parse(localStorage.getItem('fsFarm')||'null')||defaultFarm);
const saveFarmData=f=>{localStorage.setItem('fsFarm',JSON.stringify(f));return delay(f,0)};
/* Shared helper for every HarvestV API call. Throws an Error with .status (HTTP errors) and .detail (a plain-text
   explanation, if the server gave one). Errors without .status are network failures or timeouts. */
function describeApiDetail(detail) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) { // FastAPI request-validation errors: [{loc: [...], msg: '...'}, ...]
    return detail.map(d => (d && d.msg ? ((d.loc || []).slice(1).join('.') ? (d.loc || []).slice(1).join('.') + ': ' : '') + d.msg : '')).filter(Boolean).join('; ') || 'invalid request';
  }
  return 'invalid request';
}
async function apiRequest(path, { method = 'GET', body, timeoutMs = 25000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs); // NASA / a sleeping Render server can be slow
  const init = { method, signal: controller.signal };
  if (body !== undefined) { init.headers = { 'Content-Type': 'application/json' }; init.body = JSON.stringify(body); }
  try {
    const res = await fetch(`${HARVESTV_CONFIG.apiBaseUrl}${path}`, init);
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).detail; } catch (e) { /* non-JSON error body */ }
      const text = detail ? describeApiDetail(detail) : '';
      const err = new Error(`Backend returned ${res.status}${text ? ': ' + text : ''}`);
      err.status = res.status; err.detail = text;
      throw err;
    }
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('The request timed out.');
    throw err;
  } finally { clearTimeout(timer); }
}
const apiGet = (path, timeoutMs = 25000) => apiRequest(path, { timeoutMs });
const apiPost = (path, body, timeoutMs = 45000) => apiRequest(path, { method: 'POST', body, timeoutMs }); // allows for a cold Render start
/* Stage 1: environmental data from our FastAPI backend (which calls NASA POWER). */
async function getEnvironmentalData(latitude, longitude) {
  if (HARVESTV_CONFIG.useMockEnvironment) return delay(mockEnvironmentalApiResponse);
  return apiGet(`/api/environment?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`);
}
/* Turns the API response into the small object the UI uses. Throws if the response is malformed. */
function toEnvironmentView(api) {
  const w = api && api.weather;
  if (!w || typeof w.temperature !== 'number') throw new Error('Unexpected environmental data format.');
  return { temperature: w.temperature, rainfall: w.rainfall, rainfallDays: w.rainfall_days, solar: w.solar_radiation,
    solarUnits: w.solar_radiation_units || '', dataDate: w.data_date, source: (api.sources && api.sources.weather) || 'NASA POWER',
    isMock: !!(api.sources && /demo/i.test(api.sources.weather || '')),
    soilMoisture: api.soil ? api.soil.moisture : null, ndvi: api.vegetation ? api.vegetation.ndvi : null };
}
/* Stage 2: crops come from the SQLite-backed API. toCropView() maps API field names to the names the
   rest of app.js already uses, so the Crop pages and the mock rotation logic did not need to change. */
function toCropView(api) {
  if (!api || !api.id || !api.name) throw new Error('Unexpected crop data format.');
  return { id: api.id, name: api.name, emoji: api.emoji || '', season: api.season, desc: api.description,
    duration: api.growing_duration, temp: api.temperature_range, moisture: api.soil_moisture, soil: api.soil_requirements,
    nitrogen: api.nitrogen_requirement, fertilizer: api.fertilizer_notes, water: api.water_demand_score,
    waterLabel: api.water_requirement, pests: api.pest_disease_notes, drought: api.drought_tolerance,
    legume: !!api.is_legume, before: api.preceding_crops || [], after: api.following_crops || [] };
}
let cropCatalogRequest = null; // shares one request if several pages ask at once
function getCropData(force = false) {
  if (cropData.length && !force) return Promise.resolve(cropData);
  if (!cropCatalogRequest) {
    cropCatalogRequest = apiGet('/api/crops').then(res => {
      if (!res || !Array.isArray(res.crops) || !res.crops.length) throw new Error('Unexpected crop list format.');
      cropData = res.crops.map(toCropView);
      return cropData;
    }).finally(() => { cropCatalogRequest = null; });
  }
  return cropCatalogRequest;
}
async function getCropById(id) { return toCropView(await apiGet(`/api/crops/${encodeURIComponent(id)}`)); }