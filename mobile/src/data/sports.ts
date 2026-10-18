export interface SampleSportCategory {
  id: string;
  name: string;
  tagline: string;
  demoCoachCount: number;
  sampleSpecialties: string[];
  demoCoachPreview: {
    name: string;
    experience: string;
    sampleRating: string;
    samplePrice: string;
  };
}

export const SAMPLE_SPORTS: SampleSportCategory[] = [
  {
    id: 'boxing',
    name: 'Boxing',
    tagline: 'Striking fundamentals, footwork, speed, and heavy bag conditioning',
    demoCoachCount: 48,
    sampleSpecialties: ['Footwork & Defense', 'Speed Bag Drill', 'Amateur Sparring'],
    demoCoachPreview: {
      name: 'Elena Vance (Demo Coach)',
      experience: '12 yrs experience',
      sampleRating: '4.9 ★',
      samplePrice: '$55/hr (Demo)',
    },
  },
  {
    id: 'wushu',
    name: 'Wushu',
    tagline: 'Traditional forms (Taolu), weapon mastery, and contemporary Sanda sparring',
    demoCoachCount: 32,
    sampleSpecialties: ['Changquan Forms', 'Sanda Kickboxing', 'Staff & Broadsword'],
    demoCoachPreview: {
      name: 'Jin Wei (Demo Coach)',
      experience: '15 yrs experience',
      sampleRating: '5.0 ★',
      samplePrice: '$65/hr (Demo)',
    },
  },
  {
    id: 'kickboxing',
    name: 'Kickboxing',
    tagline: 'High-intensity Dutch combinations, low kicks, and cardio conditioning',
    demoCoachCount: 62,
    sampleSpecialties: ['Dutch Combinations', 'Pad Work & Combos', 'Conditioning'],
    demoCoachPreview: {
      name: 'Marcus Reed (Demo Coach)',
      experience: '8 yrs experience',
      sampleRating: '4.8 ★',
      samplePrice: '$50/hr (Demo)',
    },
  },
];
