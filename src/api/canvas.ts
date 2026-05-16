import api from './client';
import type { RoomDetail, ChecklistView, CanvasAsset } from '../types';

export const getRoom = (roomId: string) =>
  api.get<RoomDetail>(`/room-design/rooms/${roomId}`).then(r => r.data);

export const getPlacementRules = () =>
  api.get<{
    assetDefinitionDtos: Array<{
      category: string;
      assetDefinitions: Array<{
        assetDefinitionId: string;
        assetName: string;
        svgUrl: string;
        allowedLocations: string[];
      }>;
    }>;
  }>('/room-design/assets/placement-rules')
    .then(r => ({
      assetsByCategory: r.data.assetDefinitionDtos.map(cat => ({
        category: cat.category,
        assetDefinitions: cat.assetDefinitions.map(def => ({
          id:               def.assetDefinitionId,
          name:             def.assetName,
          svgUrl:           def.svgUrl,
          allowedLocations: def.allowedLocations,
        })),
      })),
    }));

export const saveLayout = (roomId: string, assets: CanvasAsset[]) =>
  api.put(`/room-design/rooms/${roomId}/layout`, assets.map(a => ({
    Id:                a.id,
    AssetDefinitionId: a.assetDefinitionId,
    AssetName:         a.assetName,
    X: a.x, Y: a.y, W: a.w, H: a.h,
    Rotation:          a.rotation,
    GroupId:           a.groupId,
    GroupLabel:        a.groupLabel,
  })));

export const reportTicket = (
  placedAssetId: string, roomId: string, facultyId: string, description: string
) =>
  api.post('/tickets', {
    PlacedAssetId: placedAssetId,
    RoomId:        roomId,
    FacultyId:     facultyId,
    Description:   description,
  }).then(r => r.data);

export const getChecklist = (placedAssetId: string) =>
  api.get<ChecklistView>(`/room-design/placed-assets/${placedAssetId}/checklist`)
    .then(r => r.data);

export const updateChecklistEntry = (checklistId: string, checklistItemId: string, isChecked: boolean) =>
  api.patch(`/room-design/checklists/${checklistId}`, {
    ChecklistItemId: checklistItemId,
    IsChecked:       isChecked,
  });
