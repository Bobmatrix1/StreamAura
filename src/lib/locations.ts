/**
 * Comprehensive Lagos Delivery Locations Directory
 * Includes all higher institutions, universities, polytechnics, colleges,
 * local government areas, districts, estates, and towns across Lagos State.
 */

export interface LocationCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export interface LocationItem {
  id: string;
  name: string;
  category: string;
  subArea?: string;
  popularTags?: string[];
  isSchool?: boolean;
}

export const LAGOS_LOCATION_CATEGORIES: LocationCategory[] = [
  {
    id: 'schools',
    name: 'Schools & Campuses',
    icon: '🏫',
    description: 'Universities, Polytechnics, Colleges & Campus Hostels across Lagos'
  },
  {
    id: 'island',
    name: 'Island, Lekki & VI',
    icon: '🌴',
    description: 'Victoria Island, Ikoyi, Lekki Phase 1 & 2, Ajah, Sangotedo, Epe'
  },
  {
    id: 'mainland-central',
    name: 'Mainland Central & Yaba',
    icon: '🏠',
    description: 'Yaba, Surulere, Ebute Metta, Somolu, Bariga, Gbagada'
  },
  {
    id: 'ikeja-central',
    name: 'Ikeja & Greater Mainland',
    icon: '🏠',
    description: 'Ikeja GRA, Maryland, Ilupeju, Oregun, Ogba, Ojodu Berger, Magodo'
  },
  {
    id: 'mainland-west',
    name: 'West Mainland & Suburbs',
    icon: '🏠',
    description: 'Agege, Egbeda, Alimosho, Festac, Amuwo Odofin, Ojo, Ikorodu, Badagry'
  },
  {
    id: 'special',
    name: 'Statewide',
    icon: '🌐',
    description: 'Statewide Delivery Coverage across all of Lagos'
  }
];

export const LAGOS_LOCATIONS: LocationItem[] = [
  // ==========================================
  // 1. HIGHER INSTITUTIONS & SCHOOLS IN LAGOS
  // ==========================================
  {
    id: 'unilag-akoka',
    name: 'University of Lagos (UNILAG) - Akoka Main Campus',
    category: 'schools',
    subArea: 'Yaba / Akoka',
    popularTags: ['unilag', 'akoka', 'moremi', 'mariere', 'jaffa', 'new hall', 'fagunwa', 'kofo', 'makama', 'honours', 'el kanemi', 'amphi', 'cits', 'faculty of arts', 'science', 'engineering', 'law', 'education', 'dli'],
    isSchool: true
  },
  {
    id: 'unilag-idi-araba',
    name: 'UNILAG - Idi-Araba (College of Medicine / CMUL / LUTH)',
    category: 'schools',
    subArea: 'Idi-Araba / Surulere / Mushin',
    popularTags: ['unilag', 'cmul', 'luth', 'idi araba', 'medical school', 'dentistry', 'pharmacy', 'hostel'],
    isSchool: true
  },
  {
    id: 'lasu-ojo',
    name: 'Lagos State University (LASU) - Ojo Main Campus',
    category: 'schools',
    subArea: 'Ojo / Iyana Iba / Badagry Expressway',
    popularTags: ['lasu', 'ojo', 'iyana iba', 'main campus', 'faculty of law', 'arts', 'science', 'management', 'social science', 'post graduate'],
    isSchool: true
  },
  {
    id: 'lasu-epe',
    name: 'Lagos State University (LASU) - Epe Campus (Engineering & Agric)',
    category: 'schools',
    subArea: 'Epe / Lagos East',
    popularTags: ['lasu epe', 'engineering', 'agriculture', 'campus'],
    isSchool: true
  },
  {
    id: 'lasucom-ikeja',
    name: 'LASUCOM - Ikeja (Lagos State University College of Medicine / LASUTH)',
    category: 'schools',
    subArea: 'Ikeja / Oba Akinjobi Way',
    popularTags: ['lasucom', 'lasuth', 'ikeja', 'medical campus', 'college of medicine'],
    isSchool: true
  },
  {
    id: 'yabatech-yaba',
    name: 'Yaba College of Technology (YABATECH) - Yaba Main Campus',
    category: 'schools',
    subArea: 'Yaba / Herbert Macaulay / Commercial Ave',
    popularTags: ['yabatech', 'yaba', 'polytechnic', 'main campus', 'moshood abiola hall', 'complex', 'art school'],
    isSchool: true
  },
  {
    id: 'yabatech-epe',
    name: 'YABATECH - Epe Campus',
    category: 'schools',
    subArea: 'Epe',
    popularTags: ['yabatech epe', 'campus', 'polytechnic'],
    isSchool: true
  },
  {
    id: 'fcet-akoka',
    name: 'Federal College of Education (Technical) - FCET Akoka',
    category: 'schools',
    subArea: 'Akoka / St. Finbarr\'s / Yaba',
    popularTags: ['fcet', 'akoka', 'college of education', 'technical'],
    isSchool: true
  },
  {
    id: 'lasustech-ikorodu',
    name: 'Lagos State University of Science and Technology (LASUSTECH) - Ikorodu',
    category: 'schools',
    subArea: 'Ikorodu / Sagamu Road / Odogunyan',
    popularTags: ['lasustech', 'laspotech', 'ikorodu', 'science and technology', 'polytechnic'],
    isSchool: true
  },
  {
    id: 'lasued-otto-ijanikin',
    name: 'Lagos State University of Education (LASUED) - Otto / Ijanikin Campus',
    category: 'schools',
    subArea: 'Otto / Ijanikin / Badagry Expressway',
    popularTags: ['lasued', 'aocefed', 'adeniran ogunsanya', 'otto', 'ijanikin', 'education university'],
    isSchool: true
  },
  {
    id: 'lasued-mocop-epe',
    name: 'LASUED - Epe Campus (Michael Otedola College Campus)',
    category: 'schools',
    subArea: 'Noforija / Epe',
    popularTags: ['lasued epe', 'mocop', 'michael otedola', 'epe campus'],
    isSchool: true
  },
  {
    id: 'pau-ibeju-lekki',
    name: 'Pan-Atlantic University (PAU) - Main Campus (Ibeju-Lekki)',
    category: 'schools',
    subArea: 'Ibeju-Lekki / Eleko Axis',
    popularTags: ['pau', 'pan atlantic', 'smc', 'sst', 'eleko', 'ibeju lekki', 'university'],
    isSchool: true
  },
  {
    id: 'lbs-ajah',
    name: 'Lagos Business School (LBS) - Ajah / Sangotedo',
    category: 'schools',
    subArea: 'Km 22 Lekki-Epe Expressway / Ajah',
    popularTags: ['lbs', 'lagos business school', 'pau', 'ajah', 'sangotedo', 'business'],
    isSchool: true
  },
  {
    id: 'caleb-university',
    name: 'Caleb University - Imota / Ikorodu Campus',
    category: 'schools',
    subArea: 'Imota / Ikorodu / Itoikin Road',
    popularTags: ['caleb university', 'imota', 'ikorodu', 'private university'],
    isSchool: true
  },
  {
    id: 'augustine-university',
    name: 'Augustine University - Ilara-Epe',
    category: 'schools',
    subArea: 'Ilara / Epe',
    popularTags: ['augustine university', 'ilara', 'epe', 'catholic university'],
    isSchool: true
  },
  {
    id: 'anchor-university',
    name: 'Anchor University - Ayobo / Ipaja',
    category: 'schools',
    subArea: 'Ayobo / Ipaja / Alimosho',
    popularTags: ['anchor university', 'ayobo', 'ipaja', 'deeper life'],
    isSchool: true
  },
  {
    id: 'nij-ogba',
    name: 'Nigerian Institute of Journalism (NIJ) - Ogba',
    category: 'schools',
    subArea: 'Ogba / Lateef Jakande Road / Ikeja',
    popularTags: ['nij', 'journalism', 'ogba', 'ikeja'],
    isSchool: true
  },
  {
    id: 'law-school-vi',
    name: 'Nigerian Law School (Lagos Campus) - Victoria Island',
    category: 'schools',
    subArea: 'Victoria Island / Ozumba Mbadiwe',
    popularTags: ['law school', 'nls', 'victoria island', 'vi'],
    isSchool: true
  },
  {
    id: 'noun-vi-hq',
    name: 'National Open University of Nigeria (NOUN) - Victoria Island Centre',
    category: 'schools',
    subArea: 'Victoria Island',
    popularTags: ['noun', 'open university', 'victoria island'],
    isSchool: true
  },
  {
    id: 'noun-mc-carthy',
    name: 'NOUN - McCarthy Study Centre (Lagos Island / Obalende)',
    category: 'schools',
    subArea: 'Lagos Island / Obalende',
    popularTags: ['noun', 'mccarthy', 'lagos island', 'obalende'],
    isSchool: true
  },
  {
    id: 'noun-ikeja',
    name: 'NOUN - Ikeja Study Centre (NERDC Complex Agidingbi)',
    category: 'schools',
    subArea: 'Agidingbi / Ikeja',
    popularTags: ['noun', 'ikeja study centre', 'agidingbi'],
    isSchool: true
  },
  {
    id: 'orthopaedic-school-igbobi',
    name: 'Federal College of Orthopaedic & Technology - Igbobi',
    category: 'schools',
    subArea: 'Igbobi / Somolu / Fadeyi',
    popularTags: ['igbobi', 'orthopaedic', 'college', 'medical'],
    isSchool: true
  },
  {
    id: 'corona-greensprings-campuses',
    name: 'Major College Campuses (Corona / Greensprings / Atlantic Hall / Queens & Kings College)',
    category: 'schools',
    subArea: 'Lagos Prep & College Campuses',
    popularTags: ['kings college', 'queens college', 'corona', 'greensprings', 'atlantic hall', 'bis lekki'],
    isSchool: true
  },

  // ==========================================
  // 2. LAGOS ISLAND, LEKKI & VI AXIS
  // ==========================================
  {
    id: 'victoria-island-all',
    name: 'Victoria Island (VI) - All Areas',
    category: 'island',
    subArea: 'VI Central / Adeola Odeku / Akin Adesola / Bishop Oluwole / Kofo Abayomi',
    popularTags: ['vi', 'victoria island', 'adeola odeku', 'ahmadu bello', 'karimu kotun']
  },
  {
    id: 'oniru-vi-ext',
    name: 'Oniru / Victoria Island Extension',
    category: 'island',
    subArea: 'Oniru Estate / Palace Way / Millennium Estate',
    popularTags: ['oniru', 'vi extension', 'palace way', 'twinwaters']
  },
  {
    id: 'ikoyi-all',
    name: 'Ikoyi - Old Ikoyi / Bourdillon / Alexander / Glover',
    category: 'island',
    subArea: 'Ikoyi Central / Kingsway / Alfred Rewane',
    popularTags: ['ikoyi', 'bourdillon', 'alexander', 'glover', 'kingsway']
  },
  {
    id: 'ikoyi-banana-island',
    name: 'Banana Island (Ikoyi)',
    category: 'island',
    subArea: 'Banana Island Residential / Commercial Zones',
    popularTags: ['banana island', 'ikoyi luxury', 'estate']
  },
  {
    id: 'ikoyi-parkview',
    name: 'Parkview Estate (Ikoyi)',
    category: 'island',
    subArea: 'Parkview Estate / Gerrard Road',
    popularTags: ['parkview', 'parkview estate', 'ikoyi']
  },
  {
    id: 'ikoyi-osborne',
    name: 'Osborne Foreshore Phase 1 & 2 (Ikoyi)',
    category: 'island',
    subArea: 'Osborne Road / Foreshore Estate',
    popularTags: ['osborne', 'osborne foreshore', 'ikoyi']
  },
  {
    id: 'lagos-island-cbd',
    name: 'Lagos Island - CMS / Marina / Broad Street / TBS',
    category: 'island',
    subArea: 'Lagos Island Central Business District / Obalende',
    popularTags: ['lagos island', 'cms', 'marina', 'broad street', 'tbs', 'obalende']
  },
  {
    id: 'lagos-island-markets',
    name: 'Lagos Island - Idumota / Balogun / Mandilas / Isale Eko',
    category: 'island',
    subArea: 'Lagos Island Commercial & Market Hubs',
    popularTags: ['idumota', 'balogun', 'mandilas', 'isale eko']
  },
  {
    id: 'lekki-phase-1',
    name: 'Lekki Phase 1 (Admiralty Way, Fola Osibo, Freedom Way)',
    category: 'island',
    subArea: 'Lekki Phase 1 Right & Left Sides / Maruwa',
    popularTags: ['lekki 1', 'lekki phase 1', 'admiralty', 'fola osibo', 'freedom way', 'maruwa']
  },
  {
    id: 'lekki-phase-2',
    name: 'Lekki Phase 2 & Environs',
    category: 'island',
    subArea: 'Lekki Phase 2 / Inupa / Ajiran',
    popularTags: ['lekki 2', 'lekki phase 2', 'estates']
  },
  {
    id: 'ikate-elegushi',
    name: 'Ikate / Elegushi / Meadow Hall Way',
    category: 'island',
    subArea: 'Ikate Elegushi / Salem Bus Stop / Chisco',
    popularTags: ['ikate', 'elegushi', 'meadow hall', 'chisco']
  },
  {
    id: 'osapa-london-agungi',
    name: 'Osapa London / Agungi / Canal West',
    category: 'island',
    subArea: 'Osapa / Agungi / Bakare Estate / Friends Colony',
    popularTags: ['osapa', 'osapa london', 'agungi', 'canal west', 'friends colony']
  },
  {
    id: 'chevron-drive',
    name: 'Chevron Drive / Chevy View / Atlantic View',
    category: 'island',
    subArea: 'Chevron Axis / Northern Foreshore / Buena Vista',
    popularTags: ['chevron', 'chevron drive', 'chevy view', 'atlantic view']
  },
  {
    id: 'igbo-efon-idado',
    name: 'Igbo-Efon / Idado / Alpha Beach Road',
    category: 'island',
    subArea: 'Igbo Efon / Idado / Alpha Beach',
    popularTags: ['igbo efon', 'idado', 'alpha beach']
  },
  {
    id: 'ikota-villa',
    name: 'Ikota / Ikota Villa Estate / Mega Mound / County Homes',
    category: 'island',
    subArea: 'Ikota Shopping Complex / Ikota Villa',
    popularTags: ['ikota', 'ikota villa', 'county homes', 'mega mound']
  },
  {
    id: 'vgc-victoria-garden-city',
    name: 'VGC (Victoria Garden City)',
    category: 'island',
    subArea: 'VGC Lekki Expressway',
    popularTags: ['vgc', 'victoria garden city', 'lekki']
  },
  {
    id: 'ajah-central',
    name: 'Ajah - Jubilee Bridge / Badore / Ilaje / Langbasa',
    category: 'island',
    subArea: 'Ajah Roundabout / Addo Road / Badore / Ilaje',
    popularTags: ['ajah', 'badore', 'addo road', 'langbasa', 'ilaje']
  },
  {
    id: 'sangotedo-novare',
    name: 'Sangotedo - Shoprite Novare / Monastery Road / Crown Estate',
    category: 'island',
    subArea: 'Sangotedo / Crown Estate / Fara Park / Diamond Estate',
    popularTags: ['sangotedo', 'novare mall', 'shoprite sangotedo', 'monastery road', 'crown estate', 'fara park']
  },
  {
    id: 'abijo-gra',
    name: 'Abijo / Abijo GRA / Chois Gardens',
    category: 'island',
    subArea: 'Abijo / Corona School / Chois Gardens',
    popularTags: ['abijo', 'abijo gra', 'chois gardens']
  },
  {
    id: 'awoyaya-mayfair',
    name: 'Awoyaya / Mayfair Gardens / Greensprings',
    category: 'island',
    subArea: 'Awoyaya / Mayfair Gardens / Meridian Park',
    popularTags: ['awoyaya', 'mayfair gardens', 'greensprings']
  },
  {
    id: 'lakowe-bogije',
    name: 'Lakowe / Lakowe Lakes & Golf / Bogije / Ologolo',
    category: 'island',
    subArea: 'Lakowe Lakes / Bogije / Beechwood Estate',
    popularTags: ['lakowe', 'lakowe lakes', 'bogije', 'beechwood']
  },
  {
    id: 'ibeju-lekki-eleko',
    name: 'Ibeju-Lekki - Eleko Beach / Free Trade Zone / Dangote Refinery',
    category: 'island',
    subArea: 'Ibeju Lekki / Eleko / Dangote Complex / Lekki Deep Sea Port',
    popularTags: ['ibeju lekki', 'eleko', 'free trade zone', 'dangote refinery', 'deep sea port']
  },
  {
    id: 'epe-central-alaro',
    name: 'Epe - Central / Alaro City / Marina / Epe Resort',
    category: 'island',
    subArea: 'Epe Town / Alaro City / Epe T-Junction',
    popularTags: ['epe', 'alaro city', 'epe marina', 'epe resort']
  },

  // ==========================================
  // 3. MAINLAND CENTRAL (YABA, SURULERE, SOMOLU)
  // ==========================================
  {
    id: 'yaba-akoka-stfinbarrs',
    name: 'Yaba - Akoka / St. Finbarr\'s / UNILAG Road / Bompai',
    category: 'mainland-central',
    subArea: 'Akoka / Community Road / University Road',
    popularTags: ['yaba', 'akoka', 'st finbarrs', 'unilag road']
  },
  {
    id: 'yaba-sabo-commercial',
    name: 'Yaba - Sabo / Commercial Avenue / Alagomeji / Tech Hubs',
    category: 'mainland-central',
    subArea: 'Sabo Yaba / Commercial Ave / Herbert Macaulay / e-Center',
    popularTags: ['yaba', 'sabo', 'commercial avenue', 'alagomeji', 'e center', 'ozone cinema']
  },
  {
    id: 'yaba-tejuosho-yabatech',
    name: 'Yaba - Tejuosho / YABATECH Road / Ojuelegba Border',
    category: 'mainland-central',
    subArea: 'Tejuosho Ultra Modern Market / Yaba Bus Stop',
    popularTags: ['yaba', 'tejuosho', 'yabatech road', 'railway compound']
  },
  {
    id: 'yaba-abule-ijesha-oja',
    name: 'Yaba - Abule Ijesha / Abule Oja / Fola Agoro Border',
    category: 'mainland-central',
    subArea: 'Abule Ijesha / Abule Oja / Student Hostels Area',
    popularTags: ['abule ijesha', 'abule oja', 'yaba hostels', 'fola agoro']
  },
  {
    id: 'yaba-onike-iwaya',
    name: 'Yaba - Onike / Iwaya / University Road',
    category: 'mainland-central',
    subArea: 'Onike / Iwaya Road / Makoko Border',
    popularTags: ['onike', 'iwaya', 'university road yaba']
  },
  {
    id: 'yaba-jibowu-fadeyi',
    name: 'Yaba - Jibowu / WAEC / Fadeyi / Total Bus Stop',
    category: 'mainland-central',
    subArea: 'Jibowu Interstate Park / WAEC Office / Fadeyi',
    popularTags: ['jibowu', 'waec', 'fadeyi', 'yaba']
  },
  {
    id: 'surulere-bode-thomas',
    name: 'Surulere - Bode Thomas / Eric Moore / Adeniran Ogunsanya',
    category: 'mainland-central',
    subArea: 'Bode Thomas / Eric Moore Towers / Leisure Mall',
    popularTags: ['surulere', 'bode thomas', 'eric moore', 'adeniran ogunsanya', 'leisure mall']
  },
  {
    id: 'surulere-aguda-enitan',
    name: 'Surulere - Aguda / Brown Road / Enitan / Adetola',
    category: 'mainland-central',
    subArea: 'Aguda / Canal View / Pako Bus Stop',
    popularTags: ['surulere', 'aguda', 'brown road', 'enitan', 'adetola']
  },
  {
    id: 'surulere-stadium-ojuelegba',
    name: 'Surulere - National Stadium / Ojuelegba / Western Avenue',
    category: 'mainland-central',
    subArea: 'National Stadium / Teslim Balogun Stadium / Ojuelegba Underbridge',
    popularTags: ['surulere', 'national stadium', 'teslim balogun', 'ojuelegba', 'western avenue']
  },
  {
    id: 'surulere-itire-lawanson',
    name: 'Surulere - Itire / Lawanson / Ijesha / Cele Border',
    category: 'mainland-central',
    subArea: 'Lawanson / Itire / Ijesha Road / Otun Oba',
    popularTags: ['surulere', 'itire', 'lawanson', 'ijesha']
  },
  {
    id: 'ebute-metta-east-west',
    name: 'Ebute Metta (East & West) / Oyingbo / Otto',
    category: 'mainland-central',
    subArea: 'Muritala Muhammed Way / Oyingbo Ultra-Modern Market / Costain',
    popularTags: ['ebute metta', 'oyingbo', 'costain', 'otto', 'murtala muhammed way']
  },
  {
    id: 'somolu-bajulaiye-pedro',
    name: 'Somolu - Bajulaiye / Pedro / Fola Agoro / Palmgrove Border',
    category: 'mainland-central',
    subArea: 'Somolu Central / Bajulaiye / Apata / Market St',
    popularTags: ['somolu', 'bajulaiye', 'pedro', 'fola agoro']
  },
  {
    id: 'bariga-ilaje-ladilak',
    name: 'Bariga - Ilaje / Pedro / Ladi-Lak / Odunsi / CMS Grammar',
    category: 'mainland-central',
    subArea: 'Bariga Roundabout / Ilaje Road / St. Finbarr\'s College Road',
    popularTags: ['bariga', 'ilaje', 'ladi lak', 'odunsi', 'cms grammar']
  },
  {
    id: 'gbagada-phase-1',
    name: 'Gbagada Phase 1 / Atunrase / Yetunde Brown',
    category: 'mainland-central',
    subArea: 'Gbagada Phase 1 / Atunrase Estate / Millennium Estate',
    popularTags: ['gbagada', 'gbagada phase 1', 'atunrase', 'yetunde brown']
  },
  {
    id: 'gbagada-phase-2',
    name: 'Gbagada Phase 2 / Harmony / Medina / Soluyi',
    category: 'mainland-central',
    subArea: 'Gbagada Phase 2 / Medina Estate / Expressway / Charlie Boy',
    popularTags: ['gbagada', 'gbagada phase 2', 'harmony estate', 'medina estate', 'soluyi']
  },
  {
    id: 'anthony-village-mende',
    name: 'Anthony Village / Mende (Maryland Border)',
    category: 'mainland-central',
    subArea: 'Anthony Village / Mende Villa / Ajao Road / GTBank Anthony',
    popularTags: ['anthony village', 'mende', 'anthony']
  },

  // ==========================================
  // 4. IKEJA & GREATER MAINLAND
  // ==========================================
  {
    id: 'ikeja-gra',
    name: 'Ikeja GRA (Government Reserved Area)',
    category: 'ikeja-central',
    subArea: 'Isaac John / Joel Ogunnaike / Oduduwa / Sobo Arobiodu / Remi Fani-Kayode',
    popularTags: ['ikeja gra', 'gra', 'isaac john', 'joel ogunnaike', 'oduduwa']
  },
  {
    id: 'ikeja-allen-opebi-toyin',
    name: 'Ikeja - Allen Avenue / Opebi / Toyin Street',
    category: 'ikeja-central',
    subArea: 'Allen Roundabout / Opebi Road / Toyin St / Awolowo Way',
    popularTags: ['ikeja', 'allen avenue', 'opebi', 'toyin street', 'awolowo way']
  },
  {
    id: 'ikeja-computer-village',
    name: 'Ikeja - Computer Village / Otigba / Underbridge',
    category: 'ikeja-central',
    subArea: 'Otigba Street / Pepple St / Medical Road',
    popularTags: ['computer village', 'otigba', 'ikeja underbridge']
  },
  {
    id: 'ikeja-alausa-secretariat',
    name: 'Ikeja - Alausa / Secretariat / Governor\'s Office / Ikeja City Mall (ICM)',
    category: 'ikeja-central',
    subArea: 'Alausa / CBD / ICM / Shoprite Ikeja / Lagos State Secretariat',
    popularTags: ['alausa', 'secretariat', 'icm', 'ikeja city mall', 'shoprite ikeja']
  },
  {
    id: 'ikeja-airport-road-mma',
    name: 'Ikeja - Airport Road / MMA1 / MMA2 / Local & International Terminals',
    category: 'ikeja-central',
    subArea: 'Murtala Muhammed Airport Terminals / Beesam / Concorde',
    popularTags: ['airport road', 'mma1', 'mma2', 'international airport', 'local airport']
  },
  {
    id: 'ikeja-oba-akran-industrial',
    name: 'Ikeja - Oba Akran / Guinness / Industrial Estate',
    category: 'ikeja-central',
    subArea: 'Oba Akran Avenue / Acme Road / Wempco Road',
    popularTags: ['oba akran', 'acme road', 'wempco', 'industrial estate']
  },
  {
    id: 'maryland-mall-cane',
    name: 'Maryland - Maryland Mall / Cane Village / Sunmola',
    category: 'ikeja-central',
    subArea: 'Maryland Roundabout / Ikorodu Road Axis / Shonibare Estate Border',
    popularTags: ['maryland', 'maryland mall', 'cane village', 'shonibare']
  },
  {
    id: 'ilupeju-coker-townplanning',
    name: 'Ilupeju / Town Planning Way / Coker Road / Industrial Area',
    category: 'ikeja-central',
    subArea: 'Ilupeju Residential / Ilupeju Industrial / Palmgrove Border',
    popularTags: ['ilupeju', 'town planning', 'coker road', 'palmgrove']
  },
  {
    id: 'palmgrove-onipanu-fadeyi',
    name: 'Palmgrove / Onipanu / Fadeyi / Obanikoro (Ikorodu Road Corridor)',
    category: 'ikeja-central',
    subArea: 'Ikorodu Road Main Axis / Dideolu / Somolu Borders',
    popularTags: ['palmgrove', 'onipanu', 'fadeyi', 'obanikoro']
  },
  {
    id: 'ojota-ogudu-gra',
    name: 'Ojota / Ogudu GRA / Ogudu Road',
    category: 'ikeja-central',
    subArea: 'Ogudu GRA Phase 1 & 2 / Ojota New Garage / Ramat',
    popularTags: ['ojota', 'ogudu', 'ogudu gra']
  },
  {
    id: 'alapere-ketu-mile12',
    name: 'Alapere / Ketu / Mile 12 / Kosofe / Agboyi',
    category: 'ikeja-central',
    subArea: 'Alapere Estate / Ketu Market / Mile 12 Market / Ikosi Road',
    popularTags: ['alapere', 'ketu', 'mile 12', 'kosofe', 'ikosi']
  },
  {
    id: 'oregun-kudirat-abiola',
    name: 'Oregun / Kudirat Abiola Way / Billings Way / Clay Bus Stop',
    category: 'ikeja-central',
    subArea: 'Oregun Industrial & Commercial Corridor',
    popularTags: ['oregun', 'kudirat abiola way', 'billings way']
  },
  {
    id: 'ogba-college-road',
    name: 'Ogba - Excellence Hotel / College Road / WAEC / Sunday Market',
    category: 'ikeja-central',
    subArea: 'Ogba Retail & Residential Hub / Haruna / WEMPCO Border',
    popularTags: ['ogba', 'college road', 'excellence hotel', 'haruna']
  },
  {
    id: 'ojodu-berger-isheri',
    name: 'Ojodu - Berger / Grammar School / Isheri Border',
    category: 'ikeja-central',
    subArea: 'Berger Bus Stop / Ojodu Market / Omole Phase 2 / Isheri',
    popularTags: ['ojodu', 'berger', 'ojodu berger', 'isheri', 'grammar school']
  },
  {
    id: 'magodo-phase-1-isheri',
    name: 'Magodo GRA Phase 1 (Isheri)',
    category: 'ikeja-central',
    subArea: 'Magodo Phase 1 / Gateway Zone / Valley View',
    popularTags: ['magodo 1', 'magodo phase 1', 'isheri']
  },
  {
    id: 'magodo-phase-2-shangisha',
    name: 'Magodo GRA Phase 2 (Shangisha / CMD Road)',
    category: 'ikeja-central',
    subArea: 'Magodo Phase 2 / Shangisha / CMD Road / Ikosi Border',
    popularTags: ['magodo 2', 'magodo phase 2', 'shangisha', 'cmd road']
  },
  {
    id: 'omole-phase-1-2',
    name: 'Omole Phase 1 & Phase 2',
    category: 'ikeja-central',
    subArea: 'Omole Estate / Agidingbi / Ojodu',
    popularTags: ['omole', 'omole phase 1', 'omole phase 2']
  },

  // ==========================================
  // 5. WEST MAINLAND & SUBURBS
  // ==========================================
  {
    id: 'agege-pen-cinema',
    name: 'Agege - Pen Cinema / Capitol Road / Dopemu / Stadium',
    category: 'mainland-west',
    subArea: 'Pen Cinema Flyover / Agege Stadium / Dopemu Underbridge',
    popularTags: ['agege', 'pen cinema', 'capitol road', 'dopemu']
  },
  {
    id: 'abule-egba-iyana-ipaja',
    name: 'Abule Egba / Iyana Ipaja / Katangowa / Meiran',
    category: 'mainland-west',
    subArea: 'Abule Egba Jubilee Bridge / Iyana Ipaja Bus Stop / Super / Pleasure',
    popularTags: ['abule egba', 'iyana ipaja', 'meiran', 'katangowa', 'pleasure']
  },
  {
    id: 'egbeda-akowonjo-shasha',
    name: 'Egbeda / Akowonjo / Shasha / Gowon Estate / Ponle',
    category: 'mainland-west',
    subArea: 'Egbeda Bus Stop / MicCom / Vulcanizer / Shasha Roundabout / Gowon Estate',
    popularTags: ['egbeda', 'akowonjo', 'shasha', 'gowon estate', 'ponle']
  },
  {
    id: 'idimu-council-pipeline',
    name: 'Idimu / Council / Pipeline / Egbe',
    category: 'mainland-west',
    subArea: 'Idimu Roundabout / Council / Liasu Road',
    popularTags: ['idimu', 'council', 'pipeline', 'egbe']
  },
  {
    id: 'ipaja-ayobo-command',
    name: 'Ipaja / Ayobo / Command / Baruwa / Megida',
    category: 'mainland-west',
    subArea: 'Ipaja Road / Command Road / Ayobo Campuses',
    popularTags: ['ipaja', 'ayobo', 'command', 'baruwa', 'megida']
  },
  {
    id: 'ikotun-synagogue-egbe',
    name: 'Ikotun / Synagogue / Egbe / Governor\'s Road',
    category: 'mainland-west',
    subArea: 'Ikotun Roundabout / Synagogue Church / College Bus Stop',
    popularTags: ['ikotun', 'synagogue', 'egbe', 'governors road']
  },
  {
    id: 'igando-lasu-road',
    name: 'Igando / General Hospital / LASU-Iba Road / Egan',
    category: 'mainland-west',
    subArea: 'Igando Bus Stop / Alimosho General Hospital / Egan',
    popularTags: ['igando', 'egan', 'lasu road', 'general hospital']
  },
  {
    id: 'ijegun-isheri-oshun',
    name: 'Ijegun / Isheri Oshun / Satellite / Bucknor',
    category: 'mainland-west',
    subArea: 'Ijegun Roundabout / Isheri Oshun / Bucknor Estate',
    popularTags: ['ijegun', 'isheri oshun', 'bucknor']
  },
  {
    id: 'isolo-ajao-estate',
    name: 'Isolo / Ajao Estate / Oke-Afa / Canoe / Ire-Akari',
    category: 'mainland-west',
    subArea: 'Ajao Estate / Ire-Akari Estate / Oke-Afa Bridge / Ago Palace Border',
    popularTags: ['isolo', 'ajao estate', 'oke afa', 'ire akari', 'canoe']
  },
  {
    id: 'ago-palace-okota',
    name: 'Ago Palace Way / Okota / Century / Green Springs',
    category: 'mainland-west',
    subArea: 'Ago Palace Way / Okota Roundabout / Apple Junction Border',
    popularTags: ['ago palace', 'okota', 'century', 'ago']
  },
  {
    id: 'oshodi-mafoluku-shogunle',
    name: 'Oshodi / Mafoluku / Shogunle / Bolade',
    category: 'mainland-west',
    subArea: 'Oshodi Transport Interchange / Mafoluku / Shogunle Railway',
    popularTags: ['oshodi', 'mafoluku', 'shogunle', 'bolade']
  },
  {
    id: 'festac-town-all',
    name: 'Festac Town (1st to 7th Avenue / 21 to 24 Road)',
    category: 'mainland-west',
    subArea: 'Festac Town / 1st Avenue / 2nd Avenue / 512 / 7th Avenue',
    popularTags: ['festac', 'festac town', '1st avenue', '2nd avenue', '7th avenue']
  },
  {
    id: 'amuwo-odofin-mile-2',
    name: 'Amuwo Odofin / Mile 2 / Apple Junction / Festac Link',
    category: 'mainland-west',
    subArea: 'Amuwo Odofin Residential / Apple Junction / Golden Tulip',
    popularTags: ['amuwo odofin', 'mile 2', 'apple junction', 'festac link']
  },
  {
    id: 'satellite-town-navy-town',
    name: 'Satellite Town / Navy Town / Abule Ado / Ijegun Egba',
    category: 'mainland-west',
    subArea: 'Satellite Town / Navy Barracks / Alakija Bus Stop',
    popularTags: ['satellite town', 'navy town', 'abule ado', 'alakija']
  },
  {
    id: 'trade-fair-badagry-exp',
    name: 'Trade Fair Complex / Ojo Alaba / Volkswagen / Barracks',
    category: 'mainland-west',
    subArea: 'Trade Fair / Auto Spare Parts / ASPAMDA / Ojo Barracks',
    popularTags: ['trade fair', 'aspamda', 'volkswagen', 'ojo barracks']
  },
  {
    id: 'ojo-lasu-gate-iyana-iba',
    name: 'Ojo - LASU Gate / Iyana Iba / Alaba International Market',
    category: 'mainland-west',
    subArea: 'Ojo Town / Iyana Iba Roundabout / Alaba Int\'l Market',
    popularTags: ['ojo', 'iyana iba', 'lasu gate', 'alaba market']
  },
  {
    id: 'okokomaiko-igbo-elerin',
    name: 'Okokomaiko / Igbo-Elerin / Otto-Awori / Shibiri',
    category: 'mainland-west',
    subArea: 'Okoko / Igbo-Elerin / Ajangbadi / Shibiri',
    popularTags: ['okokomaiko', 'igbo elerin', 'shibiri', 'ajangbadi']
  },
  {
    id: 'badagry-town-seme',
    name: 'Badagry - Marina / Roundabout / Topo / Seme Border / ASCON',
    category: 'mainland-west',
    subArea: 'Badagry Town / ASCON / Marina Beach / Seme Border',
    popularTags: ['badagry', 'ascon', 'badagry marina', 'seme border']
  },
  {
    id: 'ikorodu-town-garage',
    name: 'Ikorodu - Town / Garage / Benson / Ipakodo / Ferry Terminal',
    category: 'mainland-west',
    subArea: 'Ikorodu Central / Benson / Ipakodo Ferry Terminal / TOS Benson Rd',
    popularTags: ['ikorodu', 'ikorodu garage', 'benson', 'ipakodo', 'ferry terminal']
  },
  {
    id: 'ikorodu-agric-ogolonto',
    name: 'Ikorodu - Agric / Ogolonto / Majidun / Isawo',
    category: 'mainland-west',
    subArea: 'Agric Bus Stop / Ogolonto / Majidun Bridge / Owutu',
    popularTags: ['agric', 'ogolonto', 'majidun', 'isawo', 'owutu']
  },
  {
    id: 'ikorodu-ebute-igbogbo',
    name: 'Ikorodu - Ebute / Igbogbo / Baiyeku / Offin',
    category: 'mainland-west',
    subArea: 'Ebute Ikorodu / Igbogbo Town / Baiyeku Road',
    popularTags: ['ebute ikorodu', 'igbogbo', 'baiyeku', 'offin']
  },
  {
    id: 'ikorodu-odogunyan-lasustech',
    name: 'Ikorodu - Odogunyan / LASUSTECH Axis / Sagamu Road',
    category: 'mainland-west',
    subArea: 'Odogunyan Industrial / LASUSTECH Main Gate',
    popularTags: ['odogunyan', 'lasustech ikorodu', 'sagamu road']
  },
  {
    id: 'ikorodu-ijede-imota',
    name: 'Ikorodu - Ijede / Imota / Caleb University Axis / Maya',
    category: 'mainland-west',
    subArea: 'Ijede Genco / Imota Rice Mill / Caleb Uni Axis / Maya',
    popularTags: ['ijede', 'imota', 'caleb university', 'maya']
  },

  // ==========================================
  // 6. STATEWIDE
  // ==========================================
  {
    id: 'all-lagos-statewide',
    name: 'Lagos Statewide (All Locations in Lagos)',
    category: 'special',
    subArea: 'Statewide Delivery Coverage',
    popularTags: ['all', 'statewide', 'everywhere', 'lagos']
  }
];

/**
 * Normalizes location string for comparison
 */
export function normalizeLocation(str: string): string {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Searches Lagos locations by query text and optional category filter
 */
export function searchLagosLocations(query?: string, categoryFilter?: string): LocationItem[] {
  let list = LAGOS_LOCATIONS;
  if (categoryFilter && categoryFilter !== 'all') {
    list = list.filter(item => item.category === categoryFilter);
  }
  const q = normalizeLocation(query || '');
  if (!q) return list;

  return list.filter(item => {
    const nameMatch = normalizeLocation(item.name).includes(q);
    const subAreaMatch = item.subArea ? normalizeLocation(item.subArea).includes(q) : false;
    const tagMatch = item.popularTags?.some(tag => normalizeLocation(tag).includes(q));
    return nameMatch || subAreaMatch || tagMatch;
  });
}

/**
 * Checks if a vendor delivers to a specific user location
 * Handles 'all' coverage, fuzzy matching, and custom location inputs
 */
export function isVendorDeliveringToLocation(
  vendorDeliveryCoverageType?: 'all' | 'specific',
  vendorLocations?: string[],
  userLocation?: string
): { isCovered: boolean; matchedLocation?: string } {
  // If user hasn't selected a location yet, assume available or prompt
  if (!userLocation || !userLocation.trim()) {
    return { isCovered: true };
  }

  // If vendor delivers everywhere or has no restriction set, it's covered
  if (!vendorDeliveryCoverageType || vendorDeliveryCoverageType === 'all') {
    return { isCovered: true };
  }

  // If vendor explicitly selected "all" or "Lagos Statewide"
  if (!vendorLocations || vendorLocations.length === 0) {
    return { isCovered: true };
  }

  const normUserLoc = normalizeLocation(userLocation);

  for (const vLoc of vendorLocations) {
    const normVLoc = normalizeLocation(vLoc);

    // Check for statewide markers
    if (
      normVLoc.includes('all lagos') ||
      normVLoc.includes('statewide') ||
      normVLoc.includes('everywhere') ||
      normVLoc === 'all'
    ) {
      return { isCovered: true, matchedLocation: vLoc };
    }

    // Direct match or substring overlap
    if (normVLoc === normUserLoc || normVLoc.includes(normUserLoc) || normUserLoc.includes(normVLoc)) {
      return { isCovered: true, matchedLocation: vLoc };
    }

    // Lookup corresponding items in dictionary for acronyms like "UNILAG", "LASU", "YABATECH"
    const matchedDictItem = LAGOS_LOCATIONS.find(l => normalizeLocation(l.name) === normVLoc || l.id === vLoc);
    if (matchedDictItem) {
      if (
        matchedDictItem.popularTags?.some(t => normUserLoc.includes(normalizeLocation(t)) || normalizeLocation(t).includes(normUserLoc))
      ) {
        return { isCovered: true, matchedLocation: matchedDictItem.name };
      }
    }
  }

  return { isCovered: false };
}
