import { assetById } from '../assets'
import { ROOM } from '../domain'
import type {
  AssetDefinition,
  AssetInstance,
  PlacementPreview,
  Vec3,
} from '../domain'

const BODY_CLEARANCE = 0.025
const ROOM_EDGE_CLEARANCE = 0.2
const COLUMN_SIZE = 0.45

export const snapToGrid = (value: number, step = ROOM.grid) => {
  const snapped = Math.round(value / step) * step
  return Object.is(snapped, -0) ? 0 : snapped
}

export const normalizeQuarterTurn = (rotationY: number) => {
  const quarter = Math.round(rotationY / (Math.PI / 2))
  const normalized = ((quarter % 4) + 4) % 4
  return normalized * (Math.PI / 2)
}

export const getFootprint = (definition: AssetDefinition, rotationY: number) => {
  const quarter = Math.round(normalizeQuarterTurn(rotationY) / (Math.PI / 2)) % 2
  return quarter === 0
    ? { width: definition.dimensions.width, depth: definition.dimensions.depth }
    : { width: definition.dimensions.depth, depth: definition.dimensions.width }
}

const overlaps = (
  aPosition: Vec3,
  aSize: { width: number; depth: number },
  bPosition: Vec3,
  bSize: { width: number; depth: number },
) => (
  Math.abs(aPosition[0] - bPosition[0])
    < (aSize.width + bSize.width) / 2 + BODY_CLEARANCE
  && Math.abs(aPosition[2] - bPosition[2])
    < (aSize.depth + bSize.depth) / 2 + BODY_CLEARANCE
)

const rotateOffset = (x: number, z: number, rotationY: number) => ({
  x: x * Math.cos(rotationY) + z * Math.sin(rotationY),
  z: -x * Math.sin(rotationY) + z * Math.cos(rotationY),
})

export const getServiceZones = (definition: AssetDefinition, position: Vec3, rotationY: number) => {
  const rotation = normalizeQuarterTurn(rotationY)
  const footprint = getFootprint(definition, rotation)
  const localDepth = definition.dimensions.depth
  const frontOffset = rotateOffset(0, localDepth / 2 + definition.clearance.front / 2, rotation)
  const rearOffset = rotateOffset(0, -(localDepth / 2 + definition.clearance.rear / 2), rotation)
  const frontIsAlongZ = Math.round(rotation / (Math.PI / 2)) % 2 === 0

  return {
    front: {
      position: [position[0] + frontOffset.x, 0, position[2] + frontOffset.z] as Vec3,
      width: frontIsAlongZ ? footprint.width + definition.clearance.side * 2 : definition.clearance.front,
      depth: frontIsAlongZ ? definition.clearance.front : footprint.depth + definition.clearance.side * 2,
    },
    rear: {
      position: [position[0] + rearOffset.x, 0, position[2] + rearOffset.z] as Vec3,
      width: frontIsAlongZ ? footprint.width + definition.clearance.side * 2 : definition.clearance.rear,
      depth: frontIsAlongZ ? definition.clearance.rear : footprint.depth + definition.clearance.side * 2,
    },
  }
}

const insideRoom = (position: Vec3, size: { width: number; depth: number }) => (
  Math.abs(position[0]) + size.width / 2 <= ROOM.width / 2 - ROOM_EDGE_CLEARANCE
  && Math.abs(position[2]) + size.depth / 2 <= ROOM.depth / 2 - ROOM_EDGE_CLEARANCE
)

export const validatePlacement = (
  definition: AssetDefinition,
  position: Vec3,
  rotationY: number,
  instances: AssetInstance[],
  ignoreInstanceId?: string,
): PlacementPreview => {
  const normalizedRotation = normalizeQuarterTurn(rotationY)
  const footprint = getFootprint(definition, normalizedRotation)
  const reasons: string[] = []
  const warnings: string[] = []
  const halfRoomWidth = ROOM.width / 2
  const halfRoomDepth = ROOM.depth / 2

  if (
    Math.abs(position[0]) + footprint.width / 2 > halfRoomWidth - ROOM_EDGE_CLEARANCE
    || Math.abs(position[2]) + footprint.depth / 2 > halfRoomDepth - ROOM_EDGE_CLEARANCE
  ) {
    reasons.push('设备超出机房可布置边界')
  }

  const serviceZones = getServiceZones(definition, position, normalizedRotation)
  if (!insideRoom(serviceZones.front.position, serviceZones.front)) {
    reasons.push(`前维护区不足，需要 ${Math.round(definition.clearance.front * 1000)} mm`)
  }
  if (!insideRoom(serviceZones.rear.position, serviceZones.rear)) {
    reasons.push(`后维护区不足，需要 ${Math.round(definition.clearance.rear * 1000)} mm`)
  }

  // The opening in the south wall doubles as the equipment transport route.
  const insideTransportDoor = (
    Math.abs(position[0]) < 1.35 + footprint.width / 2
    && position[2] + footprint.depth / 2 > halfRoomDepth - 1.45
  )
  if (insideTransportDoor) reasons.push('占用南侧设备运输通道')

  for (const [columnX, columnZ] of ROOM.columns) {
    if (overlaps(position, footprint, [columnX, 0, columnZ], { width: COLUMN_SIZE, depth: COLUMN_SIZE })) {
      reasons.push('与结构柱发生碰撞')
      break
    }
  }

  for (const instance of instances) {
    if (instance.id === ignoreInstanceId) continue
    const otherDefinition = assetById[instance.definitionId]
    if (!otherDefinition) continue
    const otherFootprint = getFootprint(otherDefinition, instance.rotationY)
    if (overlaps(position, footprint, instance.position, otherFootprint)) {
      reasons.push(`与 ${instance.name} 发生碰撞`)
      break
    }

    if (
      overlaps(serviceZones.front.position, serviceZones.front, instance.position, otherFootprint)
      || overlaps(serviceZones.rear.position, serviceZones.rear, instance.position, otherFootprint)
    ) {
      warnings.push(`维护区与 ${instance.name} 接近`)
    }
  }

  return {
    definitionId: definition.id,
    position: [position[0], 0, position[2]],
    rotationY: normalizedRotation,
    valid: reasons.length === 0,
    reasons,
    warnings,
  }
}

export const makeSnappedPosition = (x: number, z: number): Vec3 => [
  snapToGrid(x),
  0,
  snapToGrid(z),
]
