export type Location = {
  name: string;
  shortAddress: string;
  fullAddress: string;
  accepted: string[];
  status: "Open" | "Closed";
  openUntil: string;
  hours: string[];
  phone: string;
  email: string;
  distance: string;
  directions: string;
  image: string;
  latitude: number;
  longitude: number;
};

export const materials = [
  "All materials",
  "Plastic",
  "Glass",
  "Paper",
  "Metal",
  "E-Waste",
  "General Waste",
];

export const locations: Location[] = [
  {
    name: "Green Recycling Centre",
    shortAddress: "14 Eco Street, Sandton · 2.4 km",
    fullAddress: "14 Eco Street, Sandton, Johannesburg, South Africa · 2.4 km away",
    accepted: ["Plastic", "Glass", "Paper", "Metal", "E-Waste"],
    status: "Open",
    openUntil: "5:00 PM",
    hours: [
      "Monday 8:00 AM - 5:00 PM",
      "Tuesday 8:00 AM - 5:00 PM",
      "Wednesday 8:00 AM - 5:00 PM",
      "Thursday 8:00 AM - 5:00 PM",
      "Friday 8:00 AM - 5:00 PM",
      "Saturday 8:00 AM - 1:00 PM",
      "Sunday Closed",
    ],
    phone: "+27 11 234 5678",
    email: "info@greenrecycling.co.za",
    distance: "2.4 km",
    directions: "Directions →",
    image: "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=800&h=400&fit=crop&auto=format",
    latitude: -26.1055,
    longitude: 28.0533,
  },
  {
    name: "EcoPoint Rosebank",
    shortAddress: "3 Tyrwhitt Ave, Rosebank · 4.1 km",
    fullAddress: "3 Tyrwhitt Ave, Rosebank, Johannesburg, South Africa · 4.1 km away",
    accepted: ["Plastic", "Paper", "General Waste"],
    status: "Open",
    openUntil: "6:00 PM",
    hours: [
      "Monday 7:00 AM - 6:00 PM",
      "Tuesday 7:00 AM - 6:00 PM",
      "Wednesday 7:00 AM - 6:00 PM",
      "Thursday 7:00 AM - 6:00 PM",
      "Friday 7:00 AM - 6:00 PM",
      "Saturday 8:00 AM - 3:00 PM",
      "Sunday 9:00 AM - 1:00 PM",
    ],
    phone: "+27 11 567 8901",
    email: "hello@ecopoint.co.za",
    distance: "4.1 km",
    directions: "Directions →",
    image: "https://images.unsplash.com/photo-1605600659908-0ef719419d41?w=800&h=400&fit=crop&auto=format",
    latitude: -26.1465,
    longitude: 28.0432,
  },
  {
    name: "Waste Not Midrand",
    shortAddress: "27 Bekker Road, Midrand · 7.8 km",
    fullAddress: "27 Bekker Road, Midrand, Johannesburg, South Africa · 7.8 km away",
    accepted: ["Metal", "E-Waste", "General Waste"],
    status: "Closed",
    openUntil: "4:00 PM",
    hours: [
      "Monday 8:00 AM - 4:00 PM",
      "Tuesday 8:00 AM - 4:00 PM",
      "Wednesday 8:00 AM - 4:00 PM",
      "Thursday 8:00 AM - 4:00 PM",
      "Friday 8:00 AM - 4:00 PM",
      "Saturday 8:00 AM - 12:00 PM",
      "Sunday Closed",
    ],
    phone: "+27 11 890 1234",
    email: "contact@wastenot.co.za",
    distance: "7.8 km",
    directions: "Directions →",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=400&fit=crop&auto=format",
    latitude: -25.9955,
    longitude: 28.128,
  },
  {
    name: "Diepsloot Community Hub",
    shortAddress: "Block C, Diepsloot · 11.3 km",
    fullAddress: "Block C, Diepsloot, Johannesburg North, South Africa · 11.3 km away",
    accepted: ["Plastic", "Glass", "Paper", "General Waste"],
    status: "Open",
    openUntil: "5:00 PM",
    hours: [
      "Monday 7:30 AM - 5:00 PM",
      "Tuesday 7:30 AM - 5:00 PM",
      "Wednesday 7:30 AM - 5:00 PM",
      "Thursday 7:30 AM - 5:00 PM",
      "Friday 7:30 AM - 5:00 PM",
      "Saturday 8:00 AM - 2:00 PM",
      "Sunday Closed",
    ],
    phone: "+27 11 345 6789",
    email: "diepsloot@citywaste.co.za",
    distance: "11.3 km",
    directions: "Directions →",
    image: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&h=400&fit=crop&auto=format",
    latitude: -25.934,
    longitude: 28.0127,
  },
];
