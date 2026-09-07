// Place at: src/lib/carModels.ts
//
// Car equivalent of motorcycleModels.ts: UK-market car nameplates,
// 2000-present, mainstream/high-volume models only - this is NOT
// exhaustive. Rare variants, region-specific trims, and low-volume
// imports are generally excluded. Anything not listed here falls back to
// the "Other / not in this list" custom-entry option in AddCarForm, same
// pattern as motorcycleModels.ts already uses for bikes.
//
// Deliberately no engine-size/fuel-type field on each entry, unlike
// MotorcycleModel's engineCC - a single car nameplate typically spans
// several engine sizes and every fuel type over its production run (a
// Ford Focus alone has been sold as petrol, diesel, and PHEV), so baking
// one "typical" figure in here would be a guess wearing a confidence
// label, the exact thing this app's own conventions avoid elsewhere.
// getCarSizeClass() in carClass.ts classifies from the user's own entered
// engineLitres/fuelType instead - make/model selection here is purely a
// typing aid, not a data source.

export interface CarModel {
  make: string;
  model: string;
}

export const CAR_MODELS: CarModel[] = [
  // ---- Ford ----
  { make: "Ford", model: "Ka" },
  { make: "Ford", model: "Fiesta" },
  { make: "Ford", model: "Focus" },
  { make: "Ford", model: "Focus C-MAX" },
  { make: "Ford", model: "Grand C-MAX" },
  { make: "Ford", model: "B-MAX" },
  { make: "Ford", model: "Mondeo" },
  { make: "Ford", model: "Puma" },
  { make: "Ford", model: "EcoSport" },
  { make: "Ford", model: "Kuga" },
  { make: "Ford", model: "Edge" },
  { make: "Ford", model: "S-MAX" },
  { make: "Ford", model: "Galaxy" },
  { make: "Ford", model: "Ranger" },
  { make: "Ford", model: "Explorer (EV)" },
  { make: "Ford", model: "Capri (EV)" },
  { make: "Ford", model: "Mustang Mach-E" },
  { make: "Ford", model: "Streetka" },
  { make: "Ford", model: "Cougar" },

  // ---- Vauxhall ----
  { make: "Vauxhall", model: "Corsa" },
  { make: "Vauxhall", model: "Astra" },
  { make: "Vauxhall", model: "Astra GTC" },
  { make: "Vauxhall", model: "Meriva" },
  { make: "Vauxhall", model: "Zafira" },
  { make: "Vauxhall", model: "Zafira Tourer" },
  { make: "Vauxhall", model: "Insignia" },
  { make: "Vauxhall", model: "Mokka" },
  { make: "Vauxhall", model: "Crossland" },
  { make: "Vauxhall", model: "Grandland" },
  { make: "Vauxhall", model: "Adam" },
  { make: "Vauxhall", model: "Viva" },
  { make: "Vauxhall", model: "Combo Life" },
  { make: "Vauxhall", model: "Cascada" },
  { make: "Vauxhall", model: "Vectra" },
  { make: "Vauxhall", model: "Signum" },
  { make: "Vauxhall", model: "Antara" },
  { make: "Vauxhall", model: "Agila" },
  { make: "Vauxhall", model: "Tigra" },

  // ---- Volkswagen ----
  { make: "Volkswagen", model: "Up!" },
  { make: "Volkswagen", model: "Polo" },
  { make: "Volkswagen", model: "Golf" },
  { make: "Volkswagen", model: "Golf Plus" },
  { make: "Volkswagen", model: "Jetta" },
  { make: "Volkswagen", model: "Passat" },
  { make: "Volkswagen", model: "Passat CC" },
  { make: "Volkswagen", model: "Arteon" },
  { make: "Volkswagen", model: "Touran" },
  { make: "Volkswagen", model: "Sharan" },
  { make: "Volkswagen", model: "Tiguan" },
  { make: "Volkswagen", model: "Tiguan Allspace" },
  { make: "Volkswagen", model: "T-Roc" },
  { make: "Volkswagen", model: "T-Cross" },
  { make: "Volkswagen", model: "Taigo" },
  { make: "Volkswagen", model: "Touareg" },
  { make: "Volkswagen", model: "Scirocco" },
  { make: "Volkswagen", model: "Beetle" },
  { make: "Volkswagen", model: "ID.3" },
  { make: "Volkswagen", model: "ID.4" },
  { make: "Volkswagen", model: "ID.5" },
  { make: "Volkswagen", model: "ID.7" },
  { make: "Volkswagen", model: "Caddy Life" },

  // ---- Audi ----
  { make: "Audi", model: "A1" },
  { make: "Audi", model: "A3" },
  { make: "Audi", model: "A4" },
  { make: "Audi", model: "A5" },
  { make: "Audi", model: "A6" },
  { make: "Audi", model: "A7" },
  { make: "Audi", model: "A8" },
  { make: "Audi", model: "Q2" },
  { make: "Audi", model: "Q3" },
  { make: "Audi", model: "Q4 e-tron" },
  { make: "Audi", model: "Q5" },
  { make: "Audi", model: "Q7" },
  { make: "Audi", model: "Q8" },
  { make: "Audi", model: "TT" },
  { make: "Audi", model: "R8" },
  { make: "Audi", model: "e-tron" },
  { make: "Audi", model: "e-tron GT" },

  // ---- BMW ----
  { make: "BMW", model: "1 Series" },
  { make: "BMW", model: "2 Series" },
  { make: "BMW", model: "3 Series" },
  { make: "BMW", model: "4 Series" },
  { make: "BMW", model: "5 Series" },
  { make: "BMW", model: "6 Series" },
  { make: "BMW", model: "7 Series" },
  { make: "BMW", model: "8 Series" },
  { make: "BMW", model: "X1" },
  { make: "BMW", model: "X2" },
  { make: "BMW", model: "X3" },
  { make: "BMW", model: "X4" },
  { make: "BMW", model: "X5" },
  { make: "BMW", model: "X6" },
  { make: "BMW", model: "X7" },
  { make: "BMW", model: "Z4" },
  { make: "BMW", model: "i3" },
  { make: "BMW", model: "i4" },
  { make: "BMW", model: "i5" },
  { make: "BMW", model: "i7" },
  { make: "BMW", model: "i8" },
  { make: "BMW", model: "iX" },
  { make: "BMW", model: "iX1" },
  { make: "BMW", model: "iX3" },

  // ---- Mercedes-Benz ----
  { make: "Mercedes-Benz", model: "A-Class" },
  { make: "Mercedes-Benz", model: "B-Class" },
  { make: "Mercedes-Benz", model: "C-Class" },
  { make: "Mercedes-Benz", model: "CLA" },
  { make: "Mercedes-Benz", model: "CLS" },
  { make: "Mercedes-Benz", model: "E-Class" },
  { make: "Mercedes-Benz", model: "S-Class" },
  { make: "Mercedes-Benz", model: "GLA" },
  { make: "Mercedes-Benz", model: "GLB" },
  { make: "Mercedes-Benz", model: "GLC" },
  { make: "Mercedes-Benz", model: "GLE" },
  { make: "Mercedes-Benz", model: "GLS" },
  { make: "Mercedes-Benz", model: "G-Class" },
  { make: "Mercedes-Benz", model: "SLK/SLC" },
  { make: "Mercedes-Benz", model: "SL" },
  { make: "Mercedes-Benz", model: "EQA" },
  { make: "Mercedes-Benz", model: "EQB" },
  { make: "Mercedes-Benz", model: "EQC" },
  { make: "Mercedes-Benz", model: "EQE" },
  { make: "Mercedes-Benz", model: "EQS" },

  // ---- Toyota ----
  { make: "Toyota", model: "Aygo" },
  { make: "Toyota", model: "Yaris" },
  { make: "Toyota", model: "Yaris Cross" },
  { make: "Toyota", model: "Corolla" },
  { make: "Toyota", model: "Auris" },
  { make: "Toyota", model: "Corolla Touring Sports" },
  { make: "Toyota", model: "C-HR" },
  { make: "Toyota", model: "RAV4" },
  { make: "Toyota", model: "Prius" },
  { make: "Toyota", model: "Prius+" },
  { make: "Toyota", model: "Camry" },
  { make: "Toyota", model: "Avensis" },
  { make: "Toyota", model: "Land Cruiser" },
  { make: "Toyota", model: "Highlander" },
  { make: "Toyota", model: "Supra" },
  { make: "Toyota", model: "GT86" },
  { make: "Toyota", model: "bZ4X" },
  { make: "Toyota", model: "Verso" },
  { make: "Toyota", model: "Hilux" },

  // ---- Honda ----
  { make: "Honda", model: "Jazz" },
  { make: "Honda", model: "Civic" },
  { make: "Honda", model: "Civic Type R" },
  { make: "Honda", model: "Accord" },
  { make: "Honda", model: "CR-V" },
  { make: "Honda", model: "HR-V" },
  { make: "Honda", model: "e" },
  { make: "Honda", model: "Insight" },
  { make: "Honda", model: "S2000" },
  { make: "Honda", model: "NSX" },
  { make: "Honda", model: "FR-V" },

  // ---- Nissan ----
  { make: "Nissan", model: "Micra" },
  { make: "Nissan", model: "Note" },
  { make: "Nissan", model: "Juke" },
  { make: "Nissan", model: "Qashqai" },
  { make: "Nissan", model: "X-Trail" },
  { make: "Nissan", model: "Leaf" },
  { make: "Nissan", model: "Pulsar" },
  { make: "Nissan", model: "Pathfinder" },
  { make: "Nissan", model: "Navara" },
  { make: "Nissan", model: "370Z" },
  { make: "Nissan", model: "GT-R" },
  { make: "Nissan", model: "Ariya" },
  { make: "Nissan", model: "Almera" },
  { make: "Nissan", model: "Primera" },

  // ---- Mazda ----
  { make: "Mazda", model: "2" },
  { make: "Mazda", model: "3" },
  { make: "Mazda", model: "6" },
  { make: "Mazda", model: "CX-3" },
  { make: "Mazda", model: "CX-30" },
  { make: "Mazda", model: "CX-5" },
  { make: "Mazda", model: "CX-60" },
  { make: "Mazda", model: "MX-5" },
  { make: "Mazda", model: "MX-30" },
  { make: "Mazda", model: "RX-8" },

  // ---- Hyundai ----
  { make: "Hyundai", model: "i10" },
  { make: "Hyundai", model: "i20" },
  { make: "Hyundai", model: "i30" },
  { make: "Hyundai", model: "i40" },
  { make: "Hyundai", model: "ix20" },
  { make: "Hyundai", model: "ix35" },
  { make: "Hyundai", model: "Tucson" },
  { make: "Hyundai", model: "Santa Fe" },
  { make: "Hyundai", model: "Kona" },
  { make: "Hyundai", model: "Bayon" },
  { make: "Hyundai", model: "Ioniq" },
  { make: "Hyundai", model: "Ioniq 5" },
  { make: "Hyundai", model: "Ioniq 6" },

  // ---- Kia ----
  { make: "Kia", model: "Picanto" },
  { make: "Kia", model: "Rio" },
  { make: "Kia", model: "Ceed" },
  { make: "Kia", model: "ProCeed" },
  { make: "Kia", model: "XCeed" },
  { make: "Kia", model: "Venga" },
  { make: "Kia", model: "Soul" },
  { make: "Kia", model: "Sportage" },
  { make: "Kia", model: "Sorento" },
  { make: "Kia", model: "Niro" },
  { make: "Kia", model: "EV6" },
  { make: "Kia", model: "EV9" },
  { make: "Kia", model: "Stonic" },
  { make: "Kia", model: "Optima" },
  { make: "Kia", model: "Carens" },

  // ---- Peugeot ----
  { make: "Peugeot", model: "107" },
  { make: "Peugeot", model: "108" },
  { make: "Peugeot", model: "206" },
  { make: "Peugeot", model: "207" },
  { make: "Peugeot", model: "208" },
  { make: "Peugeot", model: "e-208" },
  { make: "Peugeot", model: "2008" },
  { make: "Peugeot", model: "e-2008" },
  { make: "Peugeot", model: "306" },
  { make: "Peugeot", model: "307" },
  { make: "Peugeot", model: "308" },
  { make: "Peugeot", model: "3008" },
  { make: "Peugeot", model: "407" },
  { make: "Peugeot", model: "408" },
  { make: "Peugeot", model: "508" },
  { make: "Peugeot", model: "5008" },
  { make: "Peugeot", model: "RCZ" },

  // ---- Citroën ----
  { make: "Citroën", model: "C1" },
  { make: "Citroën", model: "C2" },
  { make: "Citroën", model: "C3" },
  { make: "Citroën", model: "C3 Aircross" },
  { make: "Citroën", model: "C4" },
  { make: "Citroën", model: "C4 Cactus" },
  { make: "Citroën", model: "C4 Picasso" },
  { make: "Citroën", model: "C4 X" },
  { make: "Citroën", model: "C5" },
  { make: "Citroën", model: "C5 Aircross" },
  { make: "Citroën", model: "C5 X" },
  { make: "Citroën", model: "Berlingo" },
  { make: "Citroën", model: "Xsara Picasso" },
  { make: "Citroën", model: "ë-C4" },

  // ---- Renault ----
  { make: "Renault", model: "Twingo" },
  { make: "Renault", model: "Clio" },
  { make: "Renault", model: "Megane" },
  { make: "Renault", model: "Megane E-Tech" },
  { make: "Renault", model: "Scenic" },
  { make: "Renault", model: "Grand Scenic" },
  { make: "Renault", model: "Kadjar" },
  { make: "Renault", model: "Captur" },
  { make: "Renault", model: "Kangoo" },
  { make: "Renault", model: "Laguna" },
  { make: "Renault", model: "Espace" },
  { make: "Renault", model: "Zoe" },
  { make: "Renault", model: "Twizy" },
  { make: "Renault", model: "Austral" },
  { make: "Renault", model: "Arkana" },

  // ---- Fiat ----
  { make: "Fiat", model: "Panda" },
  { make: "Fiat", model: "500" },
  { make: "Fiat", model: "500e" },
  { make: "Fiat", model: "500X" },
  { make: "Fiat", model: "500L" },
  { make: "Fiat", model: "Punto" },
  { make: "Fiat", model: "Tipo" },
  { make: "Fiat", model: "Bravo" },
  { make: "Fiat", model: "Doblo" },
  { make: "Fiat", model: "Multipla" },

  // ---- SEAT ----
  { make: "SEAT", model: "Mii" },
  { make: "SEAT", model: "Ibiza" },
  { make: "SEAT", model: "Leon" },
  { make: "SEAT", model: "Arona" },
  { make: "SEAT", model: "Ateca" },
  { make: "SEAT", model: "Tarraco" },
  { make: "SEAT", model: "Alhambra" },
  { make: "SEAT", model: "Toledo" },

  // ---- Škoda ----
  { make: "Škoda", model: "Citigo" },
  { make: "Škoda", model: "Fabia" },
  { make: "Škoda", model: "Octavia" },
  { make: "Škoda", model: "Superb" },
  { make: "Škoda", model: "Rapid" },
  { make: "Škoda", model: "Yeti" },
  { make: "Škoda", model: "Kodiaq" },
  { make: "Škoda", model: "Karoq" },
  { make: "Škoda", model: "Kamiq" },
  { make: "Škoda", model: "Scala" },
  { make: "Škoda", model: "Enyaq" },

  // ---- Volvo ----
  { make: "Volvo", model: "S40" },
  { make: "Volvo", model: "S60" },
  { make: "Volvo", model: "S80" },
  { make: "Volvo", model: "S90" },
  { make: "Volvo", model: "V40" },
  { make: "Volvo", model: "V50" },
  { make: "Volvo", model: "V60" },
  { make: "Volvo", model: "V70" },
  { make: "Volvo", model: "V90" },
  { make: "Volvo", model: "XC40" },
  { make: "Volvo", model: "XC60" },
  { make: "Volvo", model: "XC90" },
  { make: "Volvo", model: "C30" },
  { make: "Volvo", model: "C40" },
  { make: "Volvo", model: "EX30" },
  { make: "Volvo", model: "EX90" },

  // ---- Land Rover ----
  { make: "Land Rover", model: "Freelander" },
  { make: "Land Rover", model: "Discovery" },
  { make: "Land Rover", model: "Discovery Sport" },
  { make: "Land Rover", model: "Range Rover" },
  { make: "Land Rover", model: "Range Rover Sport" },
  { make: "Land Rover", model: "Range Rover Evoque" },
  { make: "Land Rover", model: "Range Rover Velar" },
  { make: "Land Rover", model: "Defender" },

  // ---- Jaguar ----
  { make: "Jaguar", model: "X-Type" },
  { make: "Jaguar", model: "S-Type" },
  { make: "Jaguar", model: "XF" },
  { make: "Jaguar", model: "XE" },
  { make: "Jaguar", model: "XJ" },
  { make: "Jaguar", model: "F-Type" },
  { make: "Jaguar", model: "F-Pace" },
  { make: "Jaguar", model: "E-Pace" },
  { make: "Jaguar", model: "I-Pace" },

  // ---- MINI ----
  { make: "MINI", model: "Hatch (One/Cooper)" },
  { make: "MINI", model: "Clubman" },
  { make: "MINI", model: "Countryman" },
  { make: "MINI", model: "Convertible" },
  { make: "MINI", model: "Coupe" },
  { make: "MINI", model: "Paceman" },
  { make: "MINI", model: "Electric" },
  { make: "MINI", model: "Aceman" },

  // ---- Suzuki ----
  { make: "Suzuki", model: "Alto" },
  { make: "Suzuki", model: "Celerio" },
  { make: "Suzuki", model: "Splash" },
  { make: "Suzuki", model: "Swift" },
  { make: "Suzuki", model: "Ignis" },
  { make: "Suzuki", model: "Baleno" },
  { make: "Suzuki", model: "Vitara" },
  { make: "Suzuki", model: "S-Cross" },
  { make: "Suzuki", model: "Jimny" },
  { make: "Suzuki", model: "SX4" },

  // ---- Mitsubishi ----
  { make: "Mitsubishi", model: "Colt" },
  { make: "Mitsubishi", model: "Lancer" },
  { make: "Mitsubishi", model: "ASX" },
  { make: "Mitsubishi", model: "Outlander" },
  { make: "Mitsubishi", model: "Shogun" },
  { make: "Mitsubishi", model: "Space Star" },
  { make: "Mitsubishi", model: "Eclipse Cross" },
  { make: "Mitsubishi", model: "Mirage" },
  { make: "Mitsubishi", model: "L200" },

  // ---- Subaru ----
  { make: "Subaru", model: "Impreza" },
  { make: "Subaru", model: "Legacy" },
  { make: "Subaru", model: "Outback" },
  { make: "Subaru", model: "Forester" },
  { make: "Subaru", model: "XV" },
  { make: "Subaru", model: "BRZ" },
  { make: "Subaru", model: "Levorg" },

  // ---- Dacia ----
  { make: "Dacia", model: "Sandero" },
  { make: "Dacia", model: "Duster" },
  { make: "Dacia", model: "Logan" },
  { make: "Dacia", model: "Jogger" },
  { make: "Dacia", model: "Spring" },

  // ---- Alfa Romeo ----
  { make: "Alfa Romeo", model: "147" },
  { make: "Alfa Romeo", model: "156" },
  { make: "Alfa Romeo", model: "159" },
  { make: "Alfa Romeo", model: "Giulietta" },
  { make: "Alfa Romeo", model: "Giulia" },
  { make: "Alfa Romeo", model: "Stelvio" },
  { make: "Alfa Romeo", model: "MiTo" },
  { make: "Alfa Romeo", model: "Tonale" },

  // ---- Lexus ----
  { make: "Lexus", model: "IS" },
  { make: "Lexus", model: "ES" },
  { make: "Lexus", model: "GS" },
  { make: "Lexus", model: "LS" },
  { make: "Lexus", model: "CT" },
  { make: "Lexus", model: "UX" },
  { make: "Lexus", model: "NX" },
  { make: "Lexus", model: "RX" },
  { make: "Lexus", model: "LC" },
  { make: "Lexus", model: "RC" },

  // ---- Porsche ----
  { make: "Porsche", model: "911" },
  { make: "Porsche", model: "Boxster" },
  { make: "Porsche", model: "Cayman" },
  { make: "Porsche", model: "Cayenne" },
  { make: "Porsche", model: "Macan" },
  { make: "Porsche", model: "Panamera" },
  { make: "Porsche", model: "Taycan" },

  // ---- Jeep ----
  { make: "Jeep", model: "Renegade" },
  { make: "Jeep", model: "Compass" },
  { make: "Jeep", model: "Cherokee" },
  { make: "Jeep", model: "Grand Cherokee" },
  { make: "Jeep", model: "Wrangler" },
  { make: "Jeep", model: "Avenger" },

  // ---- Smart ----
  { make: "Smart", model: "ForTwo" },
  { make: "Smart", model: "ForFour" },
  { make: "Smart", model: "Roadster" },

  // ---- Abarth ----
  { make: "Abarth", model: "500" },
  { make: "Abarth", model: "595" },
  { make: "Abarth", model: "695" },
  { make: "Abarth", model: "Punto" },

  // ---- DS Automobiles ----
  { make: "DS Automobiles", model: "DS3" },
  { make: "DS Automobiles", model: "DS4" },
  { make: "DS Automobiles", model: "DS5" },
  { make: "DS Automobiles", model: "DS7 Crossback" },
  { make: "DS Automobiles", model: "DS9" },

  // ---- Tesla ----
  { make: "Tesla", model: "Model S" },
  { make: "Tesla", model: "Model 3" },
  { make: "Tesla", model: "Model X" },
  { make: "Tesla", model: "Model Y" },

  // ---- Polestar ----
  { make: "Polestar", model: "Polestar 1" },
  { make: "Polestar", model: "Polestar 2" },
  { make: "Polestar", model: "Polestar 3" },
  { make: "Polestar", model: "Polestar 4" },

  // ---- MG ----
  { make: "MG", model: "MG3" },
  { make: "MG", model: "MG4" },
  { make: "MG", model: "MG5" },
  { make: "MG", model: "ZS" },
  { make: "MG", model: "HS" },
  { make: "MG", model: "GS" },
  { make: "MG", model: "MG6" },
  { make: "MG", model: "Cyberster" },

  // ---- BYD ----
  { make: "BYD", model: "Atto 3" },
  { make: "BYD", model: "Dolphin" },
  { make: "BYD", model: "Seal" },
  { make: "BYD", model: "Seal U" },

  // ---- SsangYong / KGM ----
  { make: "SsangYong", model: "Korando" },
  { make: "SsangYong", model: "Tivoli" },
  { make: "SsangYong", model: "Rexton" },
  { make: "SsangYong", model: "Musso" },

  // ---- Isuzu ----
  { make: "Isuzu", model: "D-Max" },

  // ---- Chevrolet (sold in the UK until 2015) ----
  { make: "Chevrolet", model: "Matiz" },
  { make: "Chevrolet", model: "Aveo" },
  { make: "Chevrolet", model: "Cruze" },
  { make: "Chevrolet", model: "Spark" },
  { make: "Chevrolet", model: "Captiva" },

  // ---- Saab (sold in the UK until 2011) ----
  { make: "Saab", model: "9-3" },
  { make: "Saab", model: "9-5" },
];

export const ALL_CAR_BRANDS = [...new Set(CAR_MODELS.map((m) => m.make))].sort();
