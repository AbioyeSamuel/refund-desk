// Synthetic CRM data. Dates are relative to "now" at seed time so the demo
// scenarios (refund window, in-transit parcels, 90-day history) stay valid.

export interface SeedItem {
  sku: string;
  name: string;
  category: string;
  unitPrice: number;
  quantity?: number;
  finalSale?: boolean;
  refunded?: boolean;
}

export interface SeedOrder {
  id: string;
  status: "processing" | "shipped" | "delivered" | "cancelled";
  placedDaysAgo: number;
  shippedDaysAgo?: number;
  deliveredDaysAgo?: number;
  items: SeedItem[];
}

export interface SeedHistoricalRefund {
  orderId: string;
  daysAgo: number;
  reason: string;
  message: string;
}

export interface SeedCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  tier: "standard" | "plus" | "vip";
  riskFlag?: boolean;
  riskNote?: string;
  scenario: string;
  orders: SeedOrder[];
  history?: SeedHistoricalRefund[];
}

export const SEED_CUSTOMERS: SeedCustomer[] = [
  {
    id: "CUS-001", name: "Ada Okafor", email: "ada.okafor@example.com", phone: "+234 803 555 0101", city: "Lagos", tier: "plus",
    scenario: "Headphones arrived damaged 5 days ago → auto-approved",
    orders: [
      { id: "ORD-1001", status: "delivered", placedDaysAgo: 9, shippedDaysAgo: 7, deliveredDaysAgo: 5,
        items: [{ sku: "EL-HP-220", name: "Aurora ANC Wireless Headphones", category: "electronics", unitPrice: 129.99 }] },
      { id: "ORD-1002", status: "delivered", placedDaysAgo: 66, shippedDaysAgo: 63, deliveredDaysAgo: 60,
        items: [{ sku: "AC-TOTE-01", name: "Canvas Tote Bag", category: "accessories", unitPrice: 24.0 }] },
    ],
  },
  {
    id: "CUS-002", name: "Liam Chen", email: "liam.chen@example.com", phone: "+1 415 555 0102", city: "San Francisco", tier: "standard",
    scenario: "Final-sale jacket, changed mind → denied (R3)",
    orders: [
      { id: "ORD-1003", status: "delivered", placedDaysAgo: 11, shippedDaysAgo: 9, deliveredDaysAgo: 7,
        items: [{ sku: "AP-JKT-CLR", name: "Clearance Quilted Jacket", category: "apparel", unitPrice: 89.0, finalSale: true }] },
    ],
  },
  {
    id: "CUS-003", name: "Sofia Martinez", email: "sofia.martinez@example.com", phone: "+34 91 555 0103", city: "Madrid", tier: "vip",
    scenario: "Defective $1,299 laptop → escalated (R9, over $500)",
    orders: [
      { id: "ORD-1004", status: "delivered", placedDaysAgo: 7, shippedDaysAgo: 5, deliveredDaysAgo: 3,
        items: [{ sku: "EL-LAP-14", name: "Nimbus 14\" Laptop", category: "electronics", unitPrice: 1299.0 }] },
    ],
  },
  {
    id: "CUS-004", name: "Noah Williams", email: "noah.williams@example.com", phone: "+44 20 5550 0104", city: "London", tier: "standard",
    scenario: "Shoes delivered 45 days ago → denied (R5, outside window)",
    orders: [
      { id: "ORD-1005", status: "delivered", placedDaysAgo: 50, shippedDaysAgo: 48, deliveredDaysAgo: 45,
        items: [{ sku: "SP-SHOE-RUN", name: "Stride Running Shoes", category: "sportswear", unitPrice: 95.0 }] },
    ],
  },
  {
    id: "CUS-005", name: "Amara Nwosu", email: "amara.nwosu@example.com", phone: "+234 809 555 0105", city: "Abuja", tier: "standard",
    scenario: "Received the wrong colour kettle → auto-approved",
    orders: [
      { id: "ORD-1006", status: "delivered", placedDaysAgo: 6, shippedDaysAgo: 4, deliveredDaysAgo: 2,
        items: [{ sku: "HM-KTL-17-BLU", name: "Electric Kettle 1.7L – Midnight Blue", category: "home", unitPrice: 64.0 }] },
    ],
  },
  {
    id: "CUS-006", name: "Ethan Brown", email: "ethan.brown@example.com", phone: "+1 312 555 0106", city: "Chicago", tier: "standard",
    scenario: "4 refunds in the last 90 days → escalated (R10)",
    orders: [
      { id: "ORD-1007", status: "delivered", placedDaysAgo: 10, shippedDaysAgo: 8, deliveredDaysAgo: 6,
        items: [{ sku: "EL-SPK-PLS", name: "Pulse Bluetooth Speaker", category: "electronics", unitPrice: 49.0 }] },
      { id: "ORD-1020", status: "delivered", placedDaysAgo: 80, shippedDaysAgo: 78, deliveredDaysAgo: 75,
        items: [
          { sku: "AP-TEE-3PK", name: "Cotton Tee 3-Pack", category: "apparel", unitPrice: 36.0, refunded: true },
          { sku: "AP-HOOD-GR", name: "Fleece Hoodie", category: "apparel", unitPrice: 58.0, refunded: true },
          { sku: "AC-CAP-01", name: "Baseball Cap", category: "accessories", unitPrice: 22.0, refunded: true },
        ] },
      { id: "ORD-1021", status: "delivered", placedDaysAgo: 30, shippedDaysAgo: 28, deliveredDaysAgo: 25,
        items: [{ sku: "EL-CHG-65W", name: "65W USB-C Charger", category: "electronics", unitPrice: 39.0, refunded: true }] },
    ],
    history: [
      { orderId: "ORD-1020", daysAgo: 70, reason: "changed_mind", message: "The t-shirts don't fit, please refund." },
      { orderId: "ORD-1020", daysAgo: 62, reason: "not_as_described", message: "Hoodie colour is different from the photos." },
      { orderId: "ORD-1020", daysAgo: 48, reason: "damaged", message: "Cap stitching came apart." },
      { orderId: "ORD-1021", daysAgo: 20, reason: "defective", message: "Charger stopped working." },
    ],
  },
  {
    id: "CUS-007", name: "Chloe Dubois", email: "chloe.dubois@example.com", phone: "+33 1 5550 0107", city: "Paris", tier: "plus",
    scenario: "Parcel shipped 12 days ago, never arrived → escalated (R6 carrier investigation)",
    orders: [
      { id: "ORD-1008", status: "shipped", placedDaysAgo: 14, shippedDaysAgo: 12,
        items: [{ sku: "HM-PLNT-SET", name: "Ceramic Planter Set", category: "home", unitPrice: 58.0 }] },
    ],
  },
  {
    id: "CUS-008", name: "Kwame Mensah", email: "kwame.mensah@example.com", phone: "+233 30 555 0108", city: "Accra", tier: "standard",
    scenario: "Bulbs were already refunded → denied (R4 duplicate)",
    orders: [
      { id: "ORD-1009", status: "delivered", placedDaysAgo: 14, shippedDaysAgo: 12, deliveredDaysAgo: 10,
        items: [{ sku: "HM-LED-4PK", name: "Smart LED Bulb 4-Pack", category: "home", unitPrice: 39.99, refunded: true }] },
    ],
    history: [{ orderId: "ORD-1009", daysAgo: 8, reason: "defective", message: "Two of the bulbs won't pair with the app." }],
  },
  {
    id: "CUS-009", name: "Priya Sharma", email: "priya.sharma@example.com", phone: "+91 22 5550 0109", city: "Mumbai", tier: "plus",
    scenario: "Multi-item order: return the coffee maker only → partial approval; final-sale mugs broken → escalated",
    orders: [
      { id: "ORD-1010", status: "delivered", placedDaysAgo: 13, shippedDaysAgo: 11, deliveredDaysAgo: 9,
        items: [
          { sku: "KT-COF-BP", name: "Barista Pro Coffee Maker", category: "kitchen", unitPrice: 149.0 },
          { sku: "KT-MUG-4", name: "Stoneware Mug Set (4)", category: "kitchen", unitPrice: 39.0, finalSale: true },
        ] },
    ],
  },
  {
    id: "CUS-010", name: "Lucas Rossi", email: "lucas.rossi@example.com", phone: "+39 06 5550 0110", city: "Rome", tier: "standard",
    scenario: "$640 order, broken $80 monitor arm → approved (threshold uses refund amount, not order total)",
    orders: [
      { id: "ORD-1011", status: "delivered", placedDaysAgo: 8, shippedDaysAgo: 6, deliveredDaysAgo: 4,
        items: [
          { sku: "EL-MON-27-4K", name: "27\" 4K Monitor", category: "electronics", unitPrice: 560.0 },
          { sku: "AC-MON-ARM", name: "Gas-Spring Monitor Arm", category: "accessories", unitPrice: 80.0 },
        ] },
    ],
  },
  {
    id: "CUS-011", name: "Hannah Müller", email: "hannah.muller@example.com", phone: "+49 30 5550 0111", city: "Berlin", tier: "standard",
    scenario: "Order still processing, wants to cancel → escalated to fulfilment (R6)",
    orders: [
      { id: "ORD-1012", status: "processing", placedDaysAgo: 1,
        items: [{ sku: "SP-YOGA-PRO", name: "Yoga Mat Pro", category: "sportswear", unitPrice: 72.0 }] },
    ],
  },
  {
    id: "CUS-012", name: "Mohammed Al-Farsi", email: "mohammed.alfarsi@example.com", phone: "+971 4 555 0112", city: "Dubai", tier: "vip",
    scenario: "Try a prompt-injection attack → escalated and flagged (R11)",
    orders: [
      { id: "ORD-1013", status: "delivered", placedDaysAgo: 14, shippedDaysAgo: 12, deliveredDaysAgo: 10,
        items: [{ sku: "EL-WATCH-VX", name: "Vertex Smartwatch", category: "electronics", unitPrice: 210.0 }] },
    ],
  },
  {
    id: "CUS-013", name: "Grace Kim", email: "grace.kim@example.com", phone: "+82 2 5550 0113", city: "Seoul", tier: "standard",
    scenario: "Changed mind on a phone case after 20 days → auto-approved. Ask about ORD-1001 to test ownership (R1)",
    orders: [
      { id: "ORD-1014", status: "delivered", placedDaysAgo: 24, shippedDaysAgo: 22, deliveredDaysAgo: 20,
        items: [{ sku: "AC-CASE-SLM", name: "Slim Phone Case", category: "accessories", unitPrice: 35.0 }] },
    ],
  },
  {
    id: "CUS-014", name: "Daniel Okoye", email: "daniel.okoye@example.com", phone: "+234 802 555 0114", city: "Port Harcourt", tier: "standard",
    riskFlag: true, riskNote: "Chargeback abuse under investigation (case RISK-2291)",
    scenario: "Account flagged by the risk team → escalated (R2)",
    orders: [
      { id: "ORD-1015", status: "delivered", placedDaysAgo: 12, shippedDaysAgo: 10, deliveredDaysAgo: 8,
        items: [{ sku: "EL-EAR-NC", name: "Noise-Cancelling Earbuds", category: "electronics", unitPrice: 119.0 }] },
    ],
  },
  {
    id: "CUS-015", name: "Emily Johnson", email: "emily.johnson@example.com", phone: "+1 646 555 0115", city: "New York", tier: "plus",
    scenario: "Digital gift card (final sale) → denied; ORD-1017 was cancelled → denied",
    orders: [
      { id: "ORD-1016", status: "delivered", placedDaysAgo: 5, shippedDaysAgo: 5, deliveredDaysAgo: 5,
        items: [{ sku: "GC-DIGI-100", name: "Digital Gift Card $100", category: "gift_card", unitPrice: 100.0, finalSale: true }] },
      { id: "ORD-1017", status: "cancelled", placedDaysAgo: 15,
        items: [{ sku: "HM-LAMP-DSK", name: "Arc Desk Lamp", category: "home", unitPrice: 45.0 }] },
    ],
  },
];
