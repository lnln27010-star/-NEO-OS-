import type { AssetDefinition, AssetInstance, DesignIssue } from './domain'

export const assetDefinitions: AssetDefinition[] = [
  {
    id: 'lc120',
    kind: 'gpu-rack',
    category: 'compute',
    name: 'AI 液冷柜',
    model: 'LC-120',
    summary: '52U · 120kW · 72 GPU',
    dimensions: { width: 0.8, height: 2.2, depth: 1.3 },
    weightKg: 1320,
    rackUnits: 52,
    ratedPowerKw: 120,
    coolingKw: 116,
    gpuCount: 72,
    flowLpm: 270,
    clearance: { front: 1.2, rear: 1.0, side: 0.05 },
    visual: { body: '#333c45', accent: '#42c980', emissive: '#60dda0' },
    ports: [
      { id: 'pwr-a', name: 'PWR-A', domain: 'power', direction: 'in', capacity: '400V · 250A' },
      { id: 'pwr-b', name: 'PWR-B', domain: 'power', direction: 'in', capacity: '400V · 250A' },
      { id: 'tcs-s', name: 'TCS 供液', domain: 'cooling', direction: 'in', capacity: '300 L/min' },
      { id: 'tcs-r', name: 'TCS 回液', domain: 'cooling', direction: 'out', capacity: '300 L/min' },
      { id: 'net-a', name: 'NET-A', domain: 'network', direction: 'bidirectional', capacity: '4 × 400G' },
    ],
    published: true,
  },
  {
    id: 'sr18',
    kind: 'server-rack',
    category: 'compute',
    name: '通用服务器柜',
    model: 'SR-18',
    summary: '42U · 18kW · 风冷',
    dimensions: { width: 0.7, height: 2.1, depth: 1.2 },
    weightKg: 780,
    rackUnits: 42,
    ratedPowerKw: 18,
    coolingKw: 18,
    clearance: { front: 1.2, rear: 1.0, side: 0.05 },
    visual: { body: '#3a434c', accent: '#5b9fe8', emissive: '#78b9f5' },
    ports: [
      { id: 'pwr-a', name: 'PWR-A', domain: 'power', direction: 'in', capacity: '400V · 63A' },
      { id: 'pwr-b', name: 'PWR-B', domain: 'power', direction: 'in', capacity: '400V · 63A' },
      { id: 'net-a', name: 'NET-A', domain: 'network', direction: 'bidirectional', capacity: '2 × 100G' },
    ],
    published: true,
  },
  {
    id: 'net12',
    kind: 'network-rack',
    category: 'network',
    name: '高速网络柜',
    model: 'NET-12',
    summary: '42U · 64 × 400G',
    dimensions: { width: 0.7, height: 2.1, depth: 1.1 },
    weightKg: 640,
    rackUnits: 42,
    ratedPowerKw: 12,
    coolingKw: 12,
    clearance: { front: 1.2, rear: 1.0, side: 0.05 },
    visual: { body: '#343b47', accent: '#9184e8', emissive: '#ada3f4' },
    ports: [
      { id: 'pwr-a', name: 'PWR-A', domain: 'power', direction: 'in', capacity: '400V · 32A' },
      { id: 'fabric', name: 'FABRIC', domain: 'network', direction: 'bidirectional', capacity: '64 × 400G' },
    ],
    published: true,
  },
  {
    id: 'ups500',
    kind: 'ups',
    category: 'power',
    name: '模块化 UPS',
    model: 'UPS-500',
    summary: '500kVA · 97.5%',
    dimensions: { width: 1.4, height: 2.0, depth: 0.9 },
    weightKg: 1680,
    ratedPowerKw: 500,
    clearance: { front: 1.2, rear: 0.8, side: 0.15 },
    visual: { body: '#757d84', accent: '#e6963e', emissive: '#f2bd78' },
    ports: [
      { id: 'input', name: '输入', domain: 'power', direction: 'in', capacity: '400V · 800A' },
      { id: 'output', name: '输出', domain: 'power', direction: 'out', capacity: '500kVA' },
    ],
    published: true,
  },
  {
    id: 'pdu400',
    kind: 'pdu',
    category: 'power',
    name: '列头配电柜',
    model: 'PDU-400',
    summary: '400V · 630A',
    dimensions: { width: 0.9, height: 2.0, depth: 0.8 },
    weightKg: 520,
    ratedPowerKw: 400,
    clearance: { front: 1.2, rear: 0.8, side: 0.1 },
    visual: { body: '#687078', accent: '#e89a42', emissive: '#f4bf79' },
    ports: [
      { id: 'input', name: '上游输入', domain: 'power', direction: 'in', capacity: '630A' },
      { id: 'output', name: '支路输出', domain: 'power', direction: 'out', capacity: '24 × 125A' },
    ],
    published: true,
  },
  {
    id: 'rpp400',
    kind: 'rpp',
    category: 'power',
    name: '远程配电盘',
    model: 'RPP-400A',
    summary: '400V · 400A',
    dimensions: { width: 0.9, height: 1.75, depth: 0.7 },
    weightKg: 310,
    ratedPowerKw: 260,
    clearance: { front: 1.0, rear: 0.6, side: 0.1 },
    visual: { body: '#70767a', accent: '#e7a348', emissive: '#f3c47d' },
    ports: [
      { id: 'input', name: '输入', domain: 'power', direction: 'in', capacity: '400A' },
      { id: 'branch', name: '支路', domain: 'power', direction: 'out', capacity: '18 × 63A' },
    ],
    published: true,
  },
  {
    id: 'cdu1200',
    kind: 'cdu',
    category: 'cooling',
    name: '液冷分配单元',
    model: 'CDU-1200',
    summary: '1.2MW · ΔT 5℃',
    dimensions: { width: 1.0, height: 2.0, depth: 1.2 },
    weightKg: 940,
    ratedPowerKw: 18,
    coolingKw: 1200,
    flowLpm: 2880,
    clearance: { front: 1.2, rear: 1.0, side: 0.25 },
    visual: { body: '#59666b', accent: '#28aebe', emissive: '#66d6e0' },
    ports: [
      { id: 'fws-s', name: 'FWS 供水', domain: 'cooling', direction: 'in', capacity: '3200 L/min' },
      { id: 'fws-r', name: 'FWS 回水', domain: 'cooling', direction: 'out', capacity: '3200 L/min' },
      { id: 'tcs-s', name: 'TCS 供液', domain: 'cooling', direction: 'out', capacity: '2880 L/min' },
      { id: 'tcs-r', name: 'TCS 回液', domain: 'cooling', direction: 'in', capacity: '2880 L/min' },
    ],
    published: true,
  },
  {
    id: 'crah150',
    kind: 'crah',
    category: 'cooling',
    name: '房间空调机组',
    model: 'CRAH-150',
    summary: '150kW · 38,000m³/h',
    dimensions: { width: 1.5, height: 2.2, depth: 1.1 },
    weightKg: 860,
    ratedPowerKw: 22,
    coolingKw: 150,
    clearance: { front: 1.2, rear: 0.8, side: 0.2 },
    visual: { body: '#6a767c', accent: '#3db5cf', emissive: '#77d4e7' },
    ports: [
      { id: 'power', name: '电源', domain: 'power', direction: 'in', capacity: '400V · 63A' },
      { id: 'chw-s', name: '冷冻水供水', domain: 'cooling', direction: 'in', capacity: '160 m³/h' },
      { id: 'chw-r', name: '冷冻水回水', domain: 'cooling', direction: 'out', capacity: '160 m³/h' },
    ],
    published: true,
  },
]

export const assetById = Object.fromEntries(assetDefinitions.map((item) => [item.id, item]))

const rackXs = [-4.2, -3, -1.8, -0.6, 0.6, 1.8, 3, 4.2]

const rackRows = [
  { key: 'a', z: -4.5, rotationY: 0 },
  { key: 'b', z: -2.1, rotationY: Math.PI },
  { key: 'c', z: 2.1, rotationY: 0 },
  { key: 'd', z: 4.5, rotationY: Math.PI },
]

export const initialInstances: AssetInstance[] = [
  ...rackRows.flatMap((row, rowIndex) => rackXs.map((x, index) => {
    const edgeNetwork = index === 0 && (row.key === 'a' || row.key === 'c')
    const edgeServer = index === rackXs.length - 1 && (row.key === 'b' || row.key === 'd')
    const definitionId = edgeNetwork ? 'net12' : edgeServer ? 'sr18' : 'lc120'
    const prefix = edgeNetwork ? 'NET' : edgeServer ? 'SR' : 'R'
    return {
      id: `rack-${row.key}-${index + 1}`,
      definitionId,
      name: `${prefix}-${row.key.toUpperCase()}${String(index + 1).padStart(2, '0')}`,
      position: [x, 0, row.z] as [number, number, number],
      rotationY: row.rotationY,
      loadPercent: 58 + ((rowIndex * 11 + index * 4) % 34),
      status: (row.key === 'b' && index === 2) || (row.key === 'c' && index === 6) ? ('warning' as const) : ('normal' as const),
    }
  })),
  { id: 'ups-1', definitionId: 'ups500', name: 'UPS-A01', position: [-11.6, 0, -5.8], rotationY: Math.PI / 2, loadPercent: 78, status: 'normal' },
  { id: 'pdu-1', definitionId: 'pdu400', name: 'PDU-A01', position: [-11.6, 0, -3.7], rotationY: Math.PI / 2, loadPercent: 86, status: 'warning' },
  { id: 'rpp-1', definitionId: 'rpp400', name: 'RPP-A07', position: [-11.6, 0, -2.1], rotationY: Math.PI / 2, loadPercent: 91, status: 'warning' },
  { id: 'pdu-2', definitionId: 'pdu400', name: 'PDU-B01', position: [-11.6, 0, 2.1], rotationY: Math.PI / 2, loadPercent: 73, status: 'normal' },
  { id: 'rpp-2', definitionId: 'rpp400', name: 'RPP-B05', position: [-11.6, 0, 3.7], rotationY: Math.PI / 2, loadPercent: 69, status: 'normal' },
  { id: 'ups-2', definitionId: 'ups500', name: 'UPS-B01', position: [-11.6, 0, 5.8], rotationY: Math.PI / 2, loadPercent: 71, status: 'normal' },
  { id: 'cdu-1', definitionId: 'cdu1200', name: 'CDU-01', position: [11.5, 0, -5.7], rotationY: -Math.PI / 2, loadPercent: 72, status: 'normal' },
  { id: 'cdu-2', definitionId: 'cdu1200', name: 'CDU-02', position: [11.5, 0, -3.9], rotationY: -Math.PI / 2, loadPercent: 65, status: 'normal' },
  { id: 'cdu-3', definitionId: 'cdu1200', name: 'CDU-03', position: [11.5, 0, 3.9], rotationY: -Math.PI / 2, loadPercent: 82, status: 'warning' },
  { id: 'cdu-4', definitionId: 'cdu1200', name: 'CDU-04', position: [11.5, 0, 5.7], rotationY: -Math.PI / 2, loadPercent: 61, status: 'normal' },
  { id: 'crah-1', definitionId: 'crah150', name: 'CRAH-01', position: [-6.6, 0, 7.4], rotationY: Math.PI, loadPercent: 68, status: 'normal' },
  { id: 'crah-2', definitionId: 'crah150', name: 'CRAH-02', position: [-2.2, 0, 7.4], rotationY: Math.PI, loadPercent: 74, status: 'normal' },
  { id: 'crah-3', definitionId: 'crah150', name: 'CRAH-03', position: [2.2, 0, 7.4], rotationY: Math.PI, loadPercent: 63, status: 'normal' },
  { id: 'crah-4', definitionId: 'crah150', name: 'CRAH-04', position: [6.6, 0, 7.4], rotationY: Math.PI, loadPercent: 70, status: 'normal' },
]

export const initialIssues: DesignIssue[] = [
  {
    id: 'issue-1', severity: 'blocker', targetId: 'rack-b-3', targetName: 'R-B03', title: '未连接 B 路供电', current: '1 路', limit: '2 路', ruleId: 'ELEC-RED-002', suggestion: '接入独立上游 PDU 的 B 路电源。',
  },
  {
    id: 'issue-2', severity: 'error', targetId: 'rpp-1', targetName: 'RPP-A07', title: 'A 相支路负载率超限', current: '342 A', limit: '≤ 320 A', ruleId: 'ELEC-CAP-014', suggestion: '调整三相分配或迁移两个高负载机柜。',
  },
  {
    id: 'issue-3', severity: 'warning', targetId: 'rack-a-7', targetName: 'R-A07', title: '后维护距离不足', current: '860 mm', limit: '≥ 1000 mm', ruleId: 'SPACE-MNT-006', suggestion: '向冷通道方向移动 200 mm。',
  },
  {
    id: 'issue-4', severity: 'warning', targetId: 'cdu-1', targetName: 'CDU-01', title: '二次侧流量接近设计上限', current: '2710 L/min', limit: '≤ 2880 L/min', ruleId: 'COOL-FLW-011', suggestion: '将新增机柜接入 CDU-02 支路。',
  },
  {
    id: 'issue-5', severity: 'advice', targetId: 'rack-d-8', targetName: 'SR-D08', title: '资产参数来源待确认', current: '原型参数', limit: '厂家确认', ruleId: 'DATA-SRC-001', suggestion: '补充设备厂商规格书和版本。',
  },
]
