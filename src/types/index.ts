export type Role = 'SuperAdmin' | 'AssetManager' | 'DepartmentManager' | 'Maintainer' | 'Teacher' | 'Student';

export interface AuthUser {
  userId: string;
  email: string;
  role: Role;
  token: string;
  facultyId?: string;      // Asset Managers only
  departmentId?: string;   // Dept Managers / Maintainers only
}

// ── Asset Manager portal types ────────────────────────────────────────────────
export interface FacultyInfo {
  facultyId: string;
  facultyName: string;
  buildingCount: number;
  teacherCount: number;
  studentCount: number;
}

export interface AMBuilding { id: string; name: string; address: string; }

export interface AMRoom {
  id: string;
  name: string;
  buildingId: string;
  facultyId: string;
  status: string;
  assetCount: number;
}

export interface AMTeacher   { id: string; name: string; assignedAt: string; }
export interface AMTeacherSearch { id: string; fullName: string; }
export interface AMStudent   { id: string; fullName: string; }

export interface PagedResult<T> {
  items: T[];
  total: number;        // matches C# PagedResult.Total
  page: number;
  pageSize: number;
}

// Public faculty (for student registration)
export interface Faculty { id: string; name: string; }

// Admin-facing faculty (rich view)
export interface AdminBuilding { id: string; name: string; address: string; }
export interface AdminFaculty {
  id: string;
  name: string;
  isActive: boolean;
  buildings: AdminBuilding[];
  assetManagerName: string | null;
}

export interface Building { id: string; name: string; address: string; }

export interface Department {
  id: string;
  name: string;
  handles: string;
}

export interface AssetManagerAdmin {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  facultyId: string;
  facultyName: string;
}

export interface DeptManagerAdmin {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  departmentId: string;
  departmentName: string;
  category: string;
}

export interface AdminStats {
  facultyCount: number;
  buildingCount: number;
  departmentCount: number;
}

export interface AssetDefinitionListItem {
  id: string;
  name: string;
  category: string;
  svgUrl: string;
  allowedLocations: string[];
}

export interface ChecklistItemView { id: string; description: string; }

export interface AssetDefinitionDetail {
  id: string;
  name: string;
  category: string;
  svgUrl: string;
  allowedLocations: string[];
  checklistItems: ChecklistItemView[];
}

export type AssetCategory = 'Electrical' | 'Plumbing' | 'Furniture' | 'Infrastructure';
export type PlacementLocation = 'OnWall' | 'OnCeiling' | 'OnFloor' | 'OnSurface' | 'InWall' | 'UnderSurface';

// ── Canvas / Room design ──────────────────────────────────────────────────────
export interface CanvasAsset {
  id: string;
  assetDefinitionId: string;
  assetName: string;
  svgUrl: string;
  allowedLocations: string[];
  category: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  groupId: string | null;
  groupLabel: string | null;
  condition: string;
  canvasRoomId: string | null;
}

export interface RoomDetail {
  id: string;
  name: string;
  buildingId: string;
  facultyId: string;
  status: string;
  closureReason: string | null;
  layout: {
    placedAssets: {
      id: string; assetDefinitionId: string; assetName: string;
      x: number; y: number; width: number; height: number; rotation: number;
      condition: string; groupId: string | null; groupLabel: string | null;
      canvasRoomId: string | null;
    }[];
  };
}

export interface PanelCategory {
  category: string;
  assetDefinitions: {
    id: string; name: string; svgUrl: string; allowedLocations: string[];
  }[];
}

export interface TicketNote {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  content: string;
  createdAtUtc: string;
}

// ── Asset Manager ticket types ────────────────────────────────────────────────
export interface AMTicket {
  id: string;
  assetName: string;
  roomName: string;
  facultyId: string;
  reportedByName: string;
  status: string;
  decision: string;
  assignedToDepartmentId: string | null;
  departmentName: string | null;
  currentMaintainerId: string | null;
  currentMaintainerName: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  notes: TicketNote[];
}

// ── Department Manager portal types ──────────────────────────────────────────
export interface DeptMaintainer {
  id: string;
  userId: string;
  fullName: string;
  isActive: boolean;
  departmentId: string;
  vkId?: string | null;
}

export type VkNotificationStatus = 'None' | 'Sent' | 'Failed';

export interface DeptTicket {
  id: string;
  assetName: string;
  roomId: string;
  roomName: string;
  facultyId: string;
  facultyName: string;
  buildingName: string;
  status: string;
  decision: string;
  currentMaintainerId: string | null;
  currentMaintainerName: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  vkNotificationStatus: VkNotificationStatus;
  notes: TicketNote[];
}

export interface ChecklistView {
  id: string;
  placedAssetId: string;
  studyYear: string;
  checkedCount: number;
  totalCount: number;
  entries: {
    id: string; checklistItemId: string; description: string;
    isChecked: boolean; checkedByUserId: string | null; checkedAtUtc: string | null;
  }[];
}
