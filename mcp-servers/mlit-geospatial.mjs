#!/usr/bin/env node
/**
 * MLIT Geospatial MCP Server
 *
 * Japan's Real Estate Information Library (不動産情報ライブラリ) APIs.
 * Requires MLIT_LIBRARY_API_KEY environment variable.
 * API key registration: https://www.reinfolib.mlit.go.jp/
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const API_KEY = process.env.MLIT_LIBRARY_API_KEY;
if (!API_KEY) {
  process.stderr.write('[mlit-geospatial] MLIT_LIBRARY_API_KEY is not set\n');
  process.exit(1);
}

const BASE_URL = 'https://www.reinfolib.mlit.go.jp/ex-api/external';
const ZOOM = 15;
const DEFAULT_DISTANCE = 300;

function latLonToTile(lat, lon, zoom) {
  const x = Math.floor(((lon + 180) / 360) * (1 << zoom));
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * (1 << zoom),
  );
  return { x, y };
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lon}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.results?.muniCd ?? null;
  } catch {
    return null;
  }
}

async function callApi(url) {
  const res = await fetch(url, {
    headers: { 'Ocp-Apim-Subscription-Key': API_KEY, Accept: '*/*' },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText} (${url})`);
  return res.json();
}

// API definitions: id → { name, path, type }
// type: 'area_json' = municipality-based JSON, 'point' = tile GeoJSON point, 'polygon' = tile GeoJSON polygon
const API_DEFS = {
  1:  { name: '不動産取引価格（取引価格・成約価格）情報', path: 'XIT001', type: 'area_json' },
  2:  { name: '鑑定評価書情報',                           path: 'XCT001', type: 'area_json' },
  3:  { name: '地価公示・地価調査のポイント',              path: 'XPT002', type: 'point' },
  4:  { name: '都市計画決定GISデータ（都市計画区域_区域区分）', path: 'XKT001', type: 'polygon' },
  5:  { name: '都市計画決定GISデータ（用途地域）',         path: 'XKT002', type: 'polygon' },
  6:  { name: '都市計画決定GISデータ（立地適正化計画）',   path: 'XKT003', type: 'polygon' },
  7:  { name: '国土数値情報（小学校区）',                  path: 'XKT004', type: 'polygon' },
  8:  { name: '国土数値情報（中学校区）',                  path: 'XKT005', type: 'polygon' },
  9:  { name: '国土数値情報（学校）',                      path: 'XKT006', type: 'point' },
  10: { name: '国土数値情報（保育園・幼稚園等）',          path: 'XKT007', type: 'point' },
  11: { name: '国土数値情報（医療機関）',                  path: 'XKT010', type: 'point' },
  12: { name: '国土数値情報（福祉施設）',                  path: 'XKT011', type: 'point' },
  13: { name: '国土数値情報（将来推計人口250mメッシュ）',  path: 'XKT013', type: 'polygon' },
  14: { name: '都市計画決定GISデータ（防火・準防火地域）', path: 'XKT014', type: 'polygon' },
  15: { name: '国土数値情報（駅別乗降客数）',              path: 'XKT015', type: 'point' },
  16: { name: '国土数値情報（災害危険区域）',              path: 'XKT016', type: 'polygon' },
  17: { name: '国土数値情報（図書館）',                    path: 'XKT017', type: 'point' },
  18: { name: '国土数値情報（市区町村役場及び集会施設等）',path: 'XKT018', type: 'point' },
  19: { name: '国土数値情報（自然公園地域）',              path: 'XKT019', type: 'polygon' },
  20: { name: '国土数値情報（大規模盛土造成地マップ）',    path: 'XKT020', type: 'polygon' },
  21: { name: '国土数値情報（地すべり防止地区）',          path: 'XKT021', type: 'polygon' },
  22: { name: '国土数値情報（急傾斜地崩壊危険区域）',      path: 'XKT022', type: 'polygon' },
  23: { name: '都市計画決定GISデータ（地区計画）',         path: 'XKT023', type: 'polygon' },
  24: { name: '都市計画決定GISデータ（高度利用地区）',     path: 'XKT024', type: 'polygon' },
  25: { name: '国土交通省都市局（液状化発生傾向図）',      path: 'XKT025', type: 'polygon' },
  26: { name: '国土数値情報（洪水浸水想定区域（想定最大規模））', path: 'XKT026', type: 'polygon' },
  27: { name: '国土数値情報（高潮浸水想定区域）',          path: 'XKT027', type: 'polygon' },
  28: { name: '国土数値情報（津波浸水想定）',              path: 'XKT028', type: 'polygon' },
  29: { name: '国土数値情報（土砂災害警戒区域）',          path: 'XKT029', type: 'point' },
  30: { name: '国土数値情報（人口集中地区）',              path: 'XKT031', type: 'polygon' },
};

const TOOL = {
  name: 'get_multi_api',
  description: [
    '国土交通省の不動産情報ライブラリAPIを使用して、指定した緯度経度周辺の地理情報・不動産情報を一括取得します。',
    '',
    '利用可能なAPI（target_apisに番号を指定）:',
    '1=不動産取引価格, 2=鑑定評価書, 3=地価公示・地価調査,',
    '4=都市計画区域, 5=用途地域, 6=立地適正化計画, 7=小学校区, 8=中学校区,',
    '9=学校, 10=保育園・幼稚園, 11=医療機関, 12=福祉施設,',
    '13=将来推計人口(250mメッシュ), 14=防火・準防火地域, 15=駅別乗降客数,',
    '16=災害危険区域, 17=図書館, 18=市区町村役場等, 19=自然公園地域,',
    '20=大規模盛土造成地, 21=地すべり防止地区, 22=急傾斜地崩壊危険区域,',
    '23=地区計画, 24=高度利用地区, 25=液状化発生傾向図,',
    '26=洪水浸水想定区域, 27=高潮浸水想定区域, 28=津波浸水想定,',
    '29=土砂災害警戒区域, 30=人口集中地区',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      lat: {
        type: 'number',
        description: '検索中心の緯度（十進数、例: 35.6812）',
      },
      lon: {
        type: 'number',
        description: '検索中心の経度（十進数、例: 139.7671）',
      },
      target_apis: {
        type: 'array',
        items: { type: 'integer', minimum: 1, maximum: 30 },
        description: '取得するAPIの番号リスト（1〜30）。空配列の場合は全API取得。',
      },
      distance: {
        type: 'number',
        description: 'ポイントデータの検索半径（メートル、0〜425、デフォルト300）',
        minimum: 0,
        maximum: 425,
      },
      year: {
        type: 'integer',
        description: '対象年（API 1〜3で使用）例: 2023',
        minimum: 1995,
      },
      quarter: {
        type: 'integer',
        description: '対象四半期（API 1, 2で使用）1〜4',
        minimum: 1,
        maximum: 4,
      },
      price_classification: {
        type: 'string',
        description: '取引価格種別（API 1で使用）"01"=取引価格, "02"=成約価格',
        enum: ['01', '02'],
      },
      land_price_classification: {
        type: 'string',
        description: '地価種別（API 3で使用）"01"=地価公示, "02"=都道府県地価調査',
        enum: ['01', '02'],
      },
      administrative_area_code: {
        type: 'string',
        description: '行政区域コード5桁（API 1〜2で市区町村指定に使用、省略時は座標から自動取得）',
      },
      welfare_facility_class_code: {
        type: 'string',
        description: '福祉施設種別コード（API 12で使用）',
      },
      language: {
        type: 'string',
        description: '言語設定（API 1, 2で使用）"ja"=日本語, "en"=英語',
        enum: ['ja', 'en'],
      },
    },
    required: ['lat', 'lon', 'target_apis'],
  },
};

async function callSingleApi(apiNum, args) {
  const def = API_DEFS[apiNum];
  if (!def) throw new Error(`Unknown API number: ${apiNum}`);

  const { lat, lon, distance = DEFAULT_DISTANCE } = args;

  if (def.type === 'area_json') {
    let muniCode = args.administrative_area_code;
    if (!muniCode) muniCode = await reverseGeocode(lat, lon);
    if (!muniCode) throw new Error(`市区町村コードの取得に失敗しました（API ${apiNum}）`);

    const params = new URLSearchParams({
      area: muniCode.slice(0, 2),
      city: muniCode,
    });
    if (args.year) params.set('year', String(args.year));
    if (args.quarter) params.set('quarter', String(args.quarter));
    if (apiNum === 1 && args.price_classification) {
      params.set('priceClassification', args.price_classification);
    }
    if (args.language) params.set('language', args.language);

    const data = await callApi(`${BASE_URL}/${def.path}?${params}`);
    return { api: apiNum, name: def.name, data };
  }

  // Tile-based GeoJSON APIs
  const { x, y } = latLonToTile(lat, lon, ZOOM);
  const params = new URLSearchParams({ z: String(ZOOM), x: String(x), y: String(y) });

  if (apiNum === 3) {
    if (args.year) params.set('year', String(args.year));
    if (args.land_price_classification) params.set('landPriceClassification', args.land_price_classification);
  }
  if (apiNum === 12 && args.welfare_facility_class_code) {
    params.set('welfareFacilityClassCode', args.welfare_facility_class_code);
  }

  const data = await callApi(`${BASE_URL}/${def.path}?${params}`);
  if (!data?.features) return { api: apiNum, name: def.name, feature_count: 0, features: [] };

  // Filter point data by distance; return all polygon features as-is
  const features =
    def.type === 'point'
      ? data.features.filter((f) => {
          const coords = f.geometry?.coordinates;
          if (!coords) return false;
          return haversineDistance(lat, lon, coords[1], coords[0]) <= distance;
        })
      : data.features;

  return { api: apiNum, name: def.name, feature_count: features.length, features };
}

const server = new Server(
  { name: 'mlit-geospatial', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [TOOL] }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name !== 'get_multi_api') throw new Error(`Unknown tool: ${name}`);

  try {
    const targetApis =
      args.target_apis && args.target_apis.length > 0
        ? args.target_apis
        : Object.keys(API_DEFS).map(Number);

    const settled = await Promise.allSettled(targetApis.map((n) => callSingleApi(n, args)));

    const results = settled.map((r, i) => {
      const apiNum = targetApis[i];
      if (r.status === 'rejected') {
        return { api: apiNum, name: API_DEFS[apiNum]?.name, error: r.reason?.message };
      }
      return r.value;
    });

    return {
      content: [{ type: 'text', text: JSON.stringify({ status: 'success', results }, null, 2) }],
    };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
