export type VehicleCatalogType = 'cars' | 'motorcycles' | 'trucks';

export type VehicleCatalogOption = { code: string; name: string };

const API_ROOT = 'https://fipe.parallelum.com.br/api/v2';
const catalogCache = new Map<string, Promise<VehicleCatalogOption[]>>();

const additionalBrands: Record<VehicleCatalogType, string[]> = {
  cars: [
    'Abarth', 'Aiways', 'Alpine', 'Avatr', 'BAIC', 'Baojun', 'Bestune', 'Bugatti', 'Buick', 'Cupra',
    'Dacia', 'Deepal', 'Dongfeng', 'DS Automobiles', 'Forthing', 'Genesis', 'Haval', 'Hongqi', 'Infiniti',
    'Jaecoo', 'Jetour', 'Jetta', 'KGM', 'Koenigsegg', 'Lancia', 'Lixiang', 'Lucid', 'Lynk & Co', 'Maxus',
    'Neta', 'Nio', 'Omoda', 'Opel', 'Pagani', 'Perodua', 'Polestar', 'Proton', 'Rimac', 'Rivian', 'Škoda',
    'Tata', 'Tesla', 'Togg', 'VinFast', 'Wey', 'Wuling', 'Xiaomi', 'Xpeng',
  ],
  motorcycles: [
    'BMW Motorrad', 'Lambretta', 'LiveWire', 'QJMotor', 'TVS', 'Zero',
  ],
  trucks: [
    'Freightliner', 'Hino', 'International', 'Kenworth', 'Mack', 'Peterbilt', 'Renault Trucks', 'Tata', 'Tatra',
    'Western Star', 'Volkswagen Caminhões e Ônibus', 'Facchini', 'Librelato', 'Noma', 'Randon', 'Recrusul',
    'Rodofort', 'Rossetti', 'SR', 'Triel-HT', 'Schmitz Cargobull', 'Krone', 'Kögel', 'Wielton', 'Kässbohrer',
    'Lamberet', 'Chereau', 'Benalu', 'Fruehauf', 'Fontaine', 'Wabash', 'Great Dane', 'CIMC',
  ],
};

function normalizedName(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]/g, '');
}

export function vehicleBrandKey(name: string) {
  const key = normalizedName(name);
  const aliases: Record<string, string> = {
    gmchevrolet: 'chevrolet',
    vwvolkswagen: 'volkswagen',
    kiamotors: 'kia',
    bmwmotorrad: 'bmw',
    volkswagencaminhoeseonibus: 'volkswagen',
  };
  return aliases[key] ?? key;
}

function displayBrand(type: VehicleCatalogType, option: VehicleCatalogOption): VehicleCatalogOption {
  const labels: Partial<Record<VehicleCatalogType, Record<string, string>>> = {
    cars: { '23': 'Chevrolet', '31': 'Kia', '59': 'Volkswagen' },
    motorcycles: { '67': 'BMW Motorrad' },
    trucks: { '103': 'Chevrolet', '115': 'Volkswagen Caminhões e Ônibus' },
  };
  return { ...option, name: labels[type]?.[option.code] ?? option.name };
}

async function getCatalogOptions(path: string): Promise<VehicleCatalogOption[]> {
  const cached = catalogCache.get(path);
  if (cached) return cached;

  const request = fetch(`${API_ROOT}/${path}`)
    .then(async (response) => {
      if (!response.ok) {
        if (response.status === 429) throw new Error('O catálogo de veículos atingiu o limite gratuito diário. Tente mais tarde ou preencha os dados manualmente.');
        throw new Error('Não foi possível carregar o catálogo de veículos. Você ainda pode preencher os dados manualmente.');
      }
      const data = await response.json() as VehicleCatalogOption[];
      if (!Array.isArray(data)) throw new Error('O catálogo de veículos retornou dados inválidos. Você ainda pode preencher os dados manualmente.');
      return data.sort((first, second) => first.name.localeCompare(second.name, 'pt-BR', { sensitivity: 'base' }));
    })
    .catch((reason: unknown) => {
      catalogCache.delete(path);
      if (reason instanceof Error) throw reason;
      throw new Error('Não foi possível conectar ao catálogo de veículos. Você ainda pode preencher os dados manualmente.');
    });

  catalogCache.set(path, request);
  return request;
}

export function listVehicleBrands(type: VehicleCatalogType): Promise<VehicleCatalogOption[]> {
  return getCatalogOptions(`${type}/brands`).then((catalog) => {
    const options = new Map<string, VehicleCatalogOption>();
    for (const option of catalog) {
      const normalized = displayBrand(type, option);
      options.set(vehicleBrandKey(normalized.name), normalized);
    }
    for (const name of additionalBrands[type]) {
      const key = vehicleBrandKey(name);
      if (!options.has(key)) options.set(key, { code: `supplemental:${type}:${key}`, name });
    }
    return [...options.values()].sort((first, second) => first.name.localeCompare(second.name, 'pt-BR', { sensitivity: 'base' }));
  });
}

export function listVehicleModels(type: VehicleCatalogType, brandCode: string): Promise<VehicleCatalogOption[]> {
  if (brandCode.startsWith('supplemental:')) return Promise.resolve([]);
  return getCatalogOptions(`${type}/brands/${encodeURIComponent(brandCode)}/models`);
}

export function listVehicleYears(type: VehicleCatalogType, brandCode: string, modelCode: string): Promise<VehicleCatalogOption[]> {
  if (brandCode.startsWith('supplemental:')) return Promise.resolve([]);
  return getCatalogOptions(`${type}/brands/${encodeURIComponent(brandCode)}/models/${encodeURIComponent(modelCode)}/years`);
}
