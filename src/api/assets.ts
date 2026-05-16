import api from './client';
import type { PagedResult, AssetDefinitionListItem, AssetDefinitionDetail, AssetCategory, PlacementLocation } from '../types';

// ── Enum integer maps (must match C# enum order exactly) ─────────────────────
// C# AssetCategory: Electrinical=0, Plumbing=1, Furnuture=2, Infrastructure=3
// C# PlacementLocation: OnWall=0, OnCeiling=1, OnFloor=2, OnSurface=3

const CATEGORY_INT: Record<AssetCategory, number> = {
  Electrical: 0,
  Plumbing: 1,
  Furniture: 2,
  Infrastructure: 3,
};

const LOCATION_INT: Record<PlacementLocation, number> = {
  OnWall: 0,
  OnCeiling: 1,
  OnFloor: 2,
  OnSurface: 3,
};

// ── Backend → display name normalisation ─────────────────────────────────────
// The C# enum has typos; map them to clean display names for the UI
export const normaliseCategoryName = (raw: string): string =>
  ({ Electrinical: 'Electrical', Furnuture: 'Furniture' } as Record<string, string>)[raw] ?? raw;

export const normaliseLocationName = (raw: string): string => raw; // locations have no typos

// ── API calls ────────────────────────────────────────────────────────────────
export const listAssets = (search?: string, category?: AssetCategory, page = 1, pageSize = 20) =>
  api.get<PagedResult<AssetDefinitionListItem>>('/room-design/assets', {
    params: { search, category: category !== undefined ? CATEGORY_INT[category] : undefined, page, pageSize },
  }).then(r => r.data);

export const getAsset = (id: string) =>
  api.get<AssetDefinitionDetail>(`/room-design/assets/${id}`).then(r => r.data);

export const createAsset = (payload: {
  name: string;
  svgUrl: string;
  category: AssetCategory;
  locations: PlacementLocation[];
}) =>
  api.post<{ id: string }>('/room-design/assets', {
    name: payload.name,
    svgUrl: payload.svgUrl,
    Category: CATEGORY_INT[payload.category],
    Locations: payload.locations.map(l => LOCATION_INT[l]),
  }).then(r => r.data);

export const updateAsset = (id: string, payload: {
  name: string;
  svgUrl: string;
  category: AssetCategory;
  locations: PlacementLocation[];
}) =>
  api.put(`/room-design/assets/${id}`, {
    Name: payload.name,
    SvgUrl: payload.svgUrl,
    Category: CATEGORY_INT[payload.category],
    Locations: payload.locations.map(l => LOCATION_INT[l]),
  });

export const deleteAsset = (id: string) =>
  api.delete(`/room-design/assets/${id}`);

export const addChecklistItem = (assetId: string, description: string) =>
  api.post(`/room-design/assets/${assetId}/checklist-items`, { Description: description }).then(r => r.data);

export const removeChecklistItem = (assetId: string, itemId: string) =>
  api.delete(`/room-design/assets/${assetId}/checklist-items/${itemId}`);
