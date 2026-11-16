export type SiteCity = {
  adcode: number
  name: string
  center: [number, number]
  role?: string
  candidate?: boolean
}

export type SiteProvince = {
  adcode: number
  name: string
  center: [number, number]
  region: '华北' | '东北' | '华东' | '华中' | '华南' | '西南' | '西北' | '港澳台'
  role?: string
  candidate?: boolean
}

export type CampusFacility = {
  id: string
  name: string
  type: string
  position: [number, number, number]
  size: [number, number, number]
  summary: string
  status: string
  enterable?: boolean
}

export const JIANGSU_ADCODE = 320000

// Province-level names, centers and administrative codes follow the public
// Chinese administrative-division metadata used by the prototype. Geometry
// remains the responsibility of the ChinaMapViewport layer.
export const chinaProvinces: SiteProvince[] = [
  { adcode: 110000, name: '北京市', center: [116.405285, 39.904989], region: '华北' },
  { adcode: 120000, name: '天津市', center: [117.190182, 39.125596], region: '华北' },
  { adcode: 130000, name: '河北省', center: [114.502461, 38.045474], region: '华北' },
  { adcode: 140000, name: '山西省', center: [112.549248, 37.857014], region: '华北' },
  { adcode: 150000, name: '内蒙古自治区', center: [111.670801, 40.818311], region: '华北' },
  { adcode: 210000, name: '辽宁省', center: [123.429096, 41.796767], region: '东北' },
  { adcode: 220000, name: '吉林省', center: [125.3245, 43.886841], region: '东北' },
  { adcode: 230000, name: '黑龙江省', center: [126.642464, 45.756967], region: '东北' },
  { adcode: 310000, name: '上海市', center: [121.472644, 31.231706], region: '华东' },
  { adcode: JIANGSU_ADCODE, name: '江苏省', center: [118.767413, 32.041544], region: '华东', role: '当前详细原型省份', candidate: true },
  { adcode: 330000, name: '浙江省', center: [120.153576, 30.287459], region: '华东' },
  { adcode: 340000, name: '安徽省', center: [117.283042, 31.86119], region: '华东' },
  { adcode: 350000, name: '福建省', center: [119.306239, 26.075302], region: '华东' },
  { adcode: 360000, name: '江西省', center: [115.892151, 28.676493], region: '华东' },
  { adcode: 370000, name: '山东省', center: [117.000923, 36.675807], region: '华东' },
  { adcode: 410000, name: '河南省', center: [113.665412, 34.757975], region: '华中' },
  { adcode: 420000, name: '湖北省', center: [114.298572, 30.584355], region: '华中' },
  { adcode: 430000, name: '湖南省', center: [112.982279, 28.19409], region: '华中' },
  { adcode: 440000, name: '广东省', center: [113.280637, 23.125178], region: '华南' },
  { adcode: 450000, name: '广西壮族自治区', center: [108.320004, 22.82402], region: '华南' },
  { adcode: 460000, name: '海南省', center: [110.33119, 20.031971], region: '华南' },
  { adcode: 500000, name: '重庆市', center: [106.504962, 29.533453], region: '西南' },
  { adcode: 510000, name: '四川省', center: [104.065735, 30.659462], region: '西南' },
  { adcode: 520000, name: '贵州省', center: [106.713478, 26.578343], region: '西南' },
  { adcode: 530000, name: '云南省', center: [102.712251, 25.040609], region: '西南' },
  { adcode: 540000, name: '西藏自治区', center: [91.132212, 29.660361], region: '西南' },
  { adcode: 610000, name: '陕西省', center: [108.948024, 34.263161], region: '西北' },
  { adcode: 620000, name: '甘肃省', center: [103.823557, 36.058039], region: '西北' },
  { adcode: 630000, name: '青海省', center: [101.778916, 36.623178], region: '西北' },
  { adcode: 640000, name: '宁夏回族自治区', center: [106.278179, 38.46637], region: '西北' },
  { adcode: 650000, name: '新疆维吾尔自治区', center: [87.617733, 43.792818], region: '西北' },
  { adcode: 710000, name: '台湾省', center: [121.509062, 25.044332], region: '港澳台' },
  { adcode: 810000, name: '香港特别行政区', center: [114.173355, 22.320048], region: '港澳台' },
  { adcode: 820000, name: '澳门特别行政区', center: [113.54909, 22.198951], region: '港澳台' },
]

// Names and centers are copied from public/data/jiangsu-cities.geojson properties.
export const jiangsuCities: SiteCity[] = [
  { adcode: 320100, name: '南京市', center: [118.767413, 32.041544], role: '省会 · 建模示例入口', candidate: true },
  { adcode: 320200, name: '无锡市', center: [120.301663, 31.574729] },
  { adcode: 320300, name: '徐州市', center: [117.184811, 34.261792] },
  { adcode: 320400, name: '常州市', center: [119.946973, 31.772752] },
  { adcode: 320500, name: '苏州市', center: [120.619585, 31.299379] },
  { adcode: 320600, name: '南通市', center: [120.864608, 32.016212] },
  { adcode: 320700, name: '连云港市', center: [119.178821, 34.600018] },
  { adcode: 320800, name: '淮安市', center: [119.021265, 33.597506] },
  { adcode: 320900, name: '盐城市', center: [120.139998, 33.377631] },
  { adcode: 321000, name: '扬州市', center: [119.421003, 32.393159] },
  { adcode: 321100, name: '镇江市', center: [119.452753, 32.204402] },
  { adcode: 321200, name: '泰州市', center: [119.915176, 32.484882] },
  { adcode: 321300, name: '宿迁市', center: [118.275162, 33.963008] },
]

// This is an explicitly synthetic campus used to connect province, campus and room interactions.
export const campusFacilities: CampusFacility[] = [
  {
    id: 'hall-a2',
    name: 'A2 液冷数据楼',
    type: 'data-hall',
    position: [0, 0, -2],
    size: [18, 5.6, 12],
    summary: '建模示例设施，内部提供 2F A2 液冷机房原型。',
    status: '原型可进入',
    enterable: true,
  },
  {
    id: 'hall-b1',
    name: 'B1 通用数据楼',
    type: 'data-hall',
    position: [23, 0, -3],
    size: [16, 5.2, 10],
    summary: '建模示例设施，当前只提供园区级体量与位置。',
    status: '示意模型',
  },
  {
    id: 'energy-center',
    name: '园区能源中心',
    type: 'power',
    position: [-22, 0, -10],
    size: [12, 4.6, 8],
    summary: '原型供配电设施，用于表达园区电力入口与上游关系。',
    status: '示意模型',
  },
  {
    id: 'cooling-plant',
    name: '集中冷却站',
    type: 'cooling',
    position: [-21, 0, 11],
    size: [14, 4, 8],
    summary: '原型冷源设施，用于表达冷却供回路的园区级位置。',
    status: '示意模型',
  },
  {
    id: 'operations-center',
    name: '综合运维中心',
    type: 'operations',
    position: [17, 0, 13],
    size: [10, 3.8, 7],
    summary: '原型辅助建筑，不代表真实项目建设或运行状态。',
    status: '示意模型',
  },
]

export const getCityByAdcode = (adcode: number) => (
  jiangsuCities.find((city) => city.adcode === adcode)
)

export const getProvinceByAdcode = (adcode: number) => (
  chinaProvinces.find((province) => province.adcode === adcode)
)

export const getFacilityById = (id: string) => (
  campusFacilities.find((facility) => facility.id === id)
)
