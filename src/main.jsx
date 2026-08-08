import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarClock,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  Copy,
  CreditCard,
  DollarSign,
  Eye,
  EyeOff,
  ExternalLink,
  FileCheck,
  FileSignature,
  FileText,
  Gauge,
  History,
  ImagePlus,
  KeyRound,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Star,
  Tag,
  Trash2,
  Upload,
  UserRound,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { withRequestDeadline } from './requestDeadline';
import AdminBirthdayInput, { isEligibleAdminBirthday } from './AdminBirthdayInput';
import { optimizeVehicleImage } from './lib/imageOptimizer';
import { getVehiclePriceConfirmation } from './lib/vehiclePriceSafeguards';
import { AGREEMENT_TEXT, AGREEMENT_VERSION } from './rentalAgreement';
import logoUrl from './assets/logo-sidebar.png';
import logoMobileUrl from './assets/logo-mobile.png';
import './styles.css';
import './vehicle-editor.css';
import './admin-list-details.css';
import './emails.css';
import './final-overrides.css';

const RENTMECT_ADDRESS = import.meta.env.VITE_RENTMECT_ADDRESS || '12 Holmes Circle, Farmington, CT';
const CLIENT_PORTAL_URL = (import.meta.env.VITE_CLIENT_PORTAL_URL || 'https://login.rentmect.com').replace(/\/$/, '');
const CT_TAX_RATE = 0.0635;
const MILEAGE_POLICY = '200 miles/day included; excess mileage $0.35/mile';
const CANCELLATION_TERMS = 'Contact Rent Me CT before pickup for cancellation or schedule changes.';
const DEFAULT_NEW_VEHICLE_DEPOSIT = 300;
const DEFAULT_UNDER_25_PRICING = {
  id: true,
  deposit_adjustment_enabled: true,
  deposit_adjustment_type: 'fixed',
  deposit_adjustment_value: 200,
  rental_markup_percentage: 10,
};
const DEFAULT_BILLING_AUTOMATION = {
  id: true,
  automatic_deposit_release_enabled: true,
  deposit_release_delay_days: 7,
  tollspot_automatic_sync_enabled: true,
  tollspot_auto_create_charges: true,
};
const DEFAULT_BOOKING_PAGE_SETTING = {
  active_provider: 'supabase',
  scheduled_provider: null,
  scheduled_at: null,
  effective_provider: 'supabase',
  updated_by: null,
  updated_at: null,
  server_now: null,
};
const DEFAULT_BOOKING_POLICY = {
  minimum_rental_days: 1,
  minimum_rental_hours: 24,
  advance_notice_minutes: 0,
  admin_booking_payment_deadline_minutes: 60,
  updated_by: null,
  updated_at: null,
  server_now: null,
};
const DOCUMENT_BUCKET = 'rental-documents';
const VEHICLE_IMAGE_BUCKET = 'vehicle-images';
const BLOCKING_RENTAL_STATUSES = ['pending', 'documents_needed', 'document_review', 'ready_for_pickup', 'approved', 'active', 'overdue', 'return_initiated', 'checkout_hold'];
const AVAILABILITY_RENTAL_STATUSES = [...BLOCKING_RENTAL_STATUSES];
const BLOCKING_VEHICLE_STATUSES = ['maintenance', 'unavailable', 'inactive'];
const TURNAROUND_BUFFER_MINUTES = 180;
const SMS_TEMPLATE_MAX_LENGTH = 900;
const SMS_COMPLIANCE_FOOTER = 'Reply STOP to unsubscribe or HELP for help.';

function smsTemplateComplianceError(value) {
  const body = String(value || '').trim();
  if (!/\bRent Me CT\b/i.test(body)) return 'Text templates must identify the sender as Rent Me CT.';
  if (!/\bReply\s+STOP\b/i.test(body)) return 'Text templates must include “Reply STOP to unsubscribe.”';
  if (!/\bHELP\b/i.test(body)) return 'Text templates must tell customers they can reply HELP for help.';
  if (body.length > SMS_TEMPLATE_MAX_LENGTH) return `Text templates must be ${SMS_TEMPLATE_MAX_LENGTH} characters or fewer before variables are rendered.`;
  return '';
}

const OPERATIONAL_VEHICLE_STATUS_OPTIONS = [
  ['available', 'In Service'],
  ['maintenance', 'Maintenance'],
  ['unavailable', 'Out of Service'],
  ['inactive', 'Inactive'],
];
const VEHICLE_TYPE_OPTIONS = [
  ['car', 'Car'],
  ['sedan', 'Sedan'],
  ['suv', 'SUV'],
  ['truck', 'Truck'],
  ['van', 'Van'],
  ['minivan', 'Minivan'],
  ['convertible', 'Convertible'],
];
const SYSTEM_VEHICLE_STATUSES = ['reserved', 'rented', 'on_road'];
const MANUAL_CALENDAR_ACTION_KEYS = ['available', 'admin_hold', 'unavailable', 'maintenance'];
const MANUAL_CALENDAR_BLOCK_TYPES = new Set(['admin_hold', 'unavailable', 'maintenance']);
const SYSTEM_CALENDAR_DISPLAY_KEYS = ['reserved', 'on_road', 'extension_hold'];
const ADMIN_TAB_KEYS = new Set(['dashboard', 'queue', 'payments', 'tolls', 'calendar', 'new-booking', 'rentals', 'customers', 'vehicles', 'documents', 'emails', 'audit', 'settings']);
const ADMIN_TAB_DOMAINS = {
  dashboard: ['snapshot'],
  queue: ['customer-directory', 'core', 'workflow'],
  payments: ['customer-directory', 'core', 'payments'],
  calendar: ['customer-directory', 'core', 'calendar'],
  'new-booking': ['customer-directory', 'core', 'calendar', 'settings'],
  rentals: ['customer-directory', 'core', 'workflow', 'payments', 'templates'],
  customers: ['customer-directory', 'core', 'workflow', 'templates'],
  vehicles: ['customer-directory', 'core', 'maintenance-history'],
  documents: ['customer-directory', 'core', 'workflow'],
  emails: ['customer-directory', 'core', 'workflow', 'templates'],
  audit: ['audit'],
  settings: ['settings'],
  tolls: ['customer-directory', 'core'],
};
const VIN_MAX_LENGTH = 17;
const PLATE_MAX_LENGTH = 12;
const MONEY_MAX = 100000;
const MILEAGE_MAX = 9999999;
const MAX_VEHICLE_IMAGES = 20;
const DEFAULT_MAINTENANCE_INTERVAL = 5000;
const VEHICLE_FEATURE_GROUPS = [
  {
    label: 'Safety',
    features: [
      'Backup camera',
      '360° camera',
      'Blind spot warning',
      'Lane departure warning',
      'Lane keeping assist',
      'Adaptive cruise control',
      'Forward collision warning',
      'Automatic emergency braking',
      'Parking sensors',
      'Rear cross-traffic alert',
    ],
  },
  {
    label: 'Device connectivity',
    features: [
      'Android Auto',
      'Apple CarPlay',
      'AUX input',
      'Bluetooth',
      'USB charger',
      'USB input',
      'Wireless charging',
      'Wi-Fi hotspot',
    ],
  },
  {
    label: 'Comfort & convenience',
    features: [
      'GPS',
      'Keyless entry',
      'Push-button start',
      'Remote start',
      'Heated seats',
      'Cooled seats',
      'Leather seats',
      'Power seats',
      'Sunroof',
      'Third-row seating',
    ],
  },
  {
    label: 'Capability',
    features: ['All-wheel drive', 'Four-wheel drive', 'Tow hitch', 'Roof rack'],
  },
  {
    label: 'Additional features',
    features: ['Convertible', 'Child seat', 'Pet friendly', 'Smoking allowed'],
  },
];
const KNOWN_VEHICLE_FEATURES = new Set(VEHICLE_FEATURE_GROUPS.flatMap((group) => group.features));
const DEFAULT_AVAILABILITY_TYPES = {
  available: { label: 'Available', color: '#ffffff' },
  admin_hold: { label: 'Admin Hold', color: '#486a83' },
  unavailable: { label: 'Unavailable', color: '#9f241f' },
  reserved: { label: 'Reserved', color: '#d0a017' },
  on_road: { label: 'On the Road', color: '#2f8f5b' },
  maintenance: { label: 'Maintenance', color: '#171717' },
  extension_hold: { label: 'Extension Hold', color: '#9a6a11' },
};
const SITE_PAGE_OPTIONS = [
  { value: 'index.html', label: 'Home page (index.html)' },
  { value: 'cars-2.html', label: 'Cars and booking page (cars-2.html)' },
];
const DEFAULT_VEHICLE_IMAGE_NAMES = new Set([
  'Audi-A4-002', 'Audi-A4-158', 'Audi-A6-385', 'Audi-A6-473', 'Audi-A8L-YPS',
  'Audi-Q3-100', 'Audi-Q5-148', 'Audi-Q5-149', 'Audi-Q5-203', 'Audi-Q5-210',
  'Audi-Q5-225', 'Audi-Q5-234', 'Audi-Q5-474', 'Audi-Q5-997', 'Audi-S3-001',
  'BMW-328I-004', 'BMW-330I-157', 'BMW-330XI-166', 'Benz-C300-418',
  'Benz-CLS-AMG-550-224', 'Buick-Encore-649', 'Cadillac-ATS-780',
  'Dodge-Van-451', 'Dodge-Van-452', 'Ford-Escape-650', 'Ford-F350-4X4-191',
  'Kia-Soul-656', 'Mercedes-Benz-C300-677', 'Mercedes-C300-321',
]);
const DEFAULT_VEHICLE_IMAGES_BY_KEY = new Map(
  [...DEFAULT_VEHICLE_IMAGE_NAMES].map((name) => [vehicleImageKey(name), name])
);
const PUBLIC_FLEET_ASSET_BASE_URL = (
  import.meta.env.VITE_PUBLIC_FLEET_ASSET_BASE_URL || 'https://rentmect.com/assets'
).replace(/\/$/, '');

function getAdminVehicleImage(vehicle) {
  if (Array.isArray(vehicle?.image_urls) && vehicle.image_urls[0]) return vehicle.image_urls[0];
  const imageName = DEFAULT_VEHICLE_IMAGES_BY_KEY.get(vehicleImageKey(vehicle?.name));
  return imageName ? `${PUBLIC_FLEET_ASSET_BASE_URL}/${imageName}.webp` : '';
}

function vehicleImageKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function createEmptyVehicleForm() {
  return {
    name: '', brand: '', model: '', vehicle_type: '', plate_number: '', vin: '',
    daily_rate: '', security_deposit: String(DEFAULT_NEW_VEHICLE_DEPOSIT),
    status: 'available', published: false, description: '', features: '', image_urls: '',
    original_mileage: '', current_mileage: '', maintenance_interval_miles: String(DEFAULT_MAINTENANCE_INTERVAL),
    last_maintenance_mileage: '',
  };
}

function adminBookingDateOffset(days = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseBookingDateTime(dateValue, timeValue) {
  const dateMatch = String(dateValue || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(timeValue || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!dateMatch || !timeMatch) return null;
  let hour = Number(timeMatch[1]) % 12;
  if (timeMatch[3].toUpperCase() === 'PM') hour += 12;
  const targetWallClock = Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), hour, Number(timeMatch[2]), 0);
  let instant = targetWallClock;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const eastern = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(instant)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    const observedWallClock = Date.UTC(Number(eastern.year), Number(eastern.month) - 1, Number(eastern.day), Number(eastern.hour), Number(eastern.minute), Number(eastern.second));
    instant += targetWallClock - observedWallClock;
  }
  const parsed = new Date(instant);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function localDateInput(date) {
  const eastern = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${eastern.year}-${eastern.month}-${eastern.day}`;
}

function formatAdminTime(date) {
  return date.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatAdminDuration(minutes) {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  if (value % 1440 === 0) return `${value / 1440} day${value === 1440 ? '' : 's'}`;
  if (value % 60 === 0) return `${value / 60} hour${value === 60 ? '' : 's'}`;
  return `${Math.floor(value / 60)}h ${value % 60}m`;
}

function getBookingWindow(form, policy = DEFAULT_BOOKING_POLICY) {
  const pickupAt = parseBookingDateTime(form.pickupDate, form.pickupTime);
  const returnAt = parseBookingDateTime(form.returnDate, form.returnTime);
  const minimumMinutes = Math.max(1, Number(policy.minimum_rental_days || 1)) * 1440;
  const advanceMinutes = Math.max(0, Number(policy.advance_notice_minutes || 0));
  if (!pickupAt || !returnAt) {
    return { valid: false, actualMinutes: 0, billableDays: 0, error: 'Choose valid pickup and return dates and times.' };
  }
  const actualMinutes = Math.floor((returnAt.getTime() - pickupAt.getTime()) / 60000);
  const earliestReturn = new Date(pickupAt.getTime() + minimumMinutes * 60000);
  if (actualMinutes < minimumMinutes) {
    return {
      valid: false,
      actualMinutes: Math.max(0, actualMinutes),
      billableDays: 0,
      error: `Rentals require at least ${minimumMinutes / 60} hours. The earliest return is ${earliestReturn.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}.`,
    };
  }
  const earliestPickup = new Date(Date.now() + advanceMinutes * 60000);
  if (pickupAt < earliestPickup) {
    return {
      valid: false,
      actualMinutes,
      billableDays: Math.ceil(actualMinutes / 1440),
      error: `The earliest allowed pickup is ${earliestPickup.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}.`,
    };
  }
  return { valid: true, actualMinutes, billableDays: Math.ceil(actualMinutes / 1440), error: '' };
}

async function uploadOptimizedVehicleImages(files) {
  const selectedFiles = Array.from(files || []);
  if (!selectedFiles.length) return [];
  if (selectedFiles.length > 8) throw new Error('Upload no more than 8 vehicle photos at a time.');

  const urls = [];
  for (const file of selectedFiles) {
    const optimized = await optimizeVehicleImage(file);
    const uniqueId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const objectPath = `fleet/${uniqueId}-${optimized.name}`;
    const { error: uploadError } = await supabase.storage
      .from(VEHICLE_IMAGE_BUCKET)
      .upload(objectPath, optimized, {
        cacheControl: '31536000',
        contentType: 'image/webp',
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(VEHICLE_IMAGE_BUCKET).getPublicUrl(objectPath);
    if (!data?.publicUrl) throw new Error('The uploaded vehicle photo did not return a public URL.');
    urls.push(data.publicUrl);
  }
  return urls;
}
const EMPTY_PROMOTION_FORM = {
  name: '',
  coupon_code: '',
  badge_text: 'SPECIAL OFFER',
  offer_value: '15%',
  offer_suffix: 'off',
  popup_kicker: 'Limited-Time Special',
  popup_title: '',
  popup_body: '',
  banner_title: '',
  banner_body: 'Use code',
  cta_label: 'Choose Your Car',
  cta_url: 'cars-2.html',
  fine_print: '',
  starts_at: '',
  ends_at: '',
  popup_enabled: true,
  banner_enabled: true,
  popup_pages: ['index.html'],
  banner_pages: ['cars-2.html'],
  active: true,
};

const INSURANCE_RESOURCE_LINKS = [
  { label: 'Bonzah Insurance', detail: 'Rental insurance options', href: 'https://bonzah.com/', recommended: true },
  { label: 'RentalCover', detail: 'Rental protection options', href: 'https://rentalcover.com/' },
  { label: 'Faye Insurance', detail: 'Rental car coverage information', href: 'https://www.withfaye.com/info/rental-car-coverage/' },
  { label: 'Capital One', detail: 'Rental car card-benefit information', href: 'https://www.capitalone.com/learn-grow/more-than-money/capital-one-rental-car-insurance/' },
];

const ADMIN_QUICK_LINK_GROUPS = [
  {
    label: 'Money',
    links: [
      { label: 'Stripe', href: 'https://dashboard.stripe.com/login' },
      { label: 'QuickBooks', href: 'https://qbo.intuit.com/' },
      { label: 'TD Bank', href: 'https://www.td.com/us/en/personal-banking/my-td' },
    ],
  },
  {
    label: 'Messages',
    links: [
      { label: 'Twilio', href: 'https://console.twilio.com/' },
      { label: 'SendGrid', href: 'https://app.sendgrid.com/' },
    ],
  },
  {
    label: 'Rental Operations',
    links: [
      { label: 'TollSpot', href: 'https://tollspot.com/' },
    ],
  },
  { label: 'Insurance', links: INSURANCE_RESOURCE_LINKS },
];

function updateFetchedState(setter, nextValue, silent) {
  if (nextValue === null || nextValue === undefined) return;
  if (!silent) {
    setter(nextValue);
    return;
  }
  setter((currentValue) =>
    JSON.stringify(currentValue) === JSON.stringify(nextValue) ? currentValue : nextValue
  );
}

function App() {
  const initialAdminParams = new URLSearchParams(window.location.search);
  const requestedAdminTab = initialAdminParams.get('tab') || '';
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [adminRoleChecking, setAdminRoleChecking] = useState(true);
  const [dataHealth, setDataHealth] = useState({
    refreshing: false,
    errors: [],
    lastUpdated: null,
  });
  const [dashboardSnapshot, setDashboardSnapshot] = useState(null);
  const [customerDirectoryState, setCustomerDirectoryState] = useState({
    loading: false,
    error: '',
    lastUpdated: null,
  });
  const loadedAdminDomainsRef = useRef(new Set());
  const adminDomainLoadsRef = useRef(new Map());
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [authMessage, setAuthMessage] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [notice, setNotice] = useState(null);
  const noticeTimeoutRef = useRef(null);
  const updateNoticeShownRef = useRef(false);
  const [activeTab, setActiveTab] = useState(() => {
    if (readActiveReturnRentalId()) return 'rentals';
    return ADMIN_TAB_KEYS.has(requestedAdminTab) ? requestedAdminTab : 'dashboard';
  });
  const [isMobileAdminNav, setIsMobileAdminNav] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches);
  const [navCollapsed, setNavCollapsed] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches);
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [rentalFilter, setRentalFilter] = useState('needs_action');
  const backgroundRefreshInFlightRef = useRef(false);

  const [profiles, setProfiles] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [maintenanceSchedules, setMaintenanceSchedules] = useState([]);
  const [maintenanceServiceLogs, setMaintenanceServiceLogs] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [pendingBookings, setPendingBookings] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [reports, setReports] = useState([]);
  const [extensionRequests, setExtensionRequests] = useState([]);
  const [emergencyExceptions, setEmergencyExceptions] = useState([]);
  const [rentalStepCompletions, setRentalStepCompletions] = useState([]);
  const [depositAllocations, setDepositAllocations] = useState([]);
  const [rentalPayments, setRentalPayments] = useState([]);
  const [rentalRefunds, setRentalRefunds] = useState([]);
  const [rentalCharges, setRentalCharges] = useState([]);
  const [stripeReconciliationIssues, setStripeReconciliationIssues] = useState([]);
  const [paymentLoadError, setPaymentLoadError] = useState('');
  const [customerEmailTemplates, setCustomerEmailTemplates] = useState([]);
  const [smsTemplates, setSmsTemplates] = useState([]);
  const [discountCodes, setDiscountCodes] = useState([]);
  const [serviceFees, setServiceFees] = useState([]);
  const [under25Pricing, setUnder25Pricing] = useState(DEFAULT_UNDER_25_PRICING);
  const [under25PricingSaving, setUnder25PricingSaving] = useState(false);
  const [billingAutomation, setBillingAutomation] = useState(DEFAULT_BILLING_AUTOMATION);
  const [billingAutomationSaving, setBillingAutomationSaving] = useState(false);
  const [bookingPageSetting, setBookingPageSetting] = useState(DEFAULT_BOOKING_PAGE_SETTING);
  const [bookingPolicy, setBookingPolicy] = useState(DEFAULT_BOOKING_POLICY);
  const [bookingPolicySaving, setBookingPolicySaving] = useState(false);
  const [sitePromotions, setSitePromotions] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [promotionForm, setPromotionForm] = useState({ ...EMPTY_PROMOTION_FORM });
  const [editingPromotionId, setEditingPromotionId] = useState('');
  const [availabilityBlocks, setAvailabilityBlocks] = useState([]);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [editingAvailabilityBlockId, setEditingAvailabilityBlockId] = useState('');
  const [availabilityTypes, setAvailabilityTypes] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('rentmect_availability_types') || '{}');
      const validSaved = Object.fromEntries(Object.entries(DEFAULT_AVAILABILITY_TYPES).map(([key, defaults]) => [key, {
        label: defaults.label,
        color: String(saved?.[key]?.color || defaults.color),
      }]));
      return { ...DEFAULT_AVAILABILITY_TYPES, ...validSaved };
    } catch {
      return DEFAULT_AVAILABILITY_TYPES;
    }
  });

  const [selectedRentalId, setSelectedRentalId] = useState('');
  const [manualBookingFocusId, setManualBookingFocusId] = useState(() => initialAdminParams.get('rental') || '');
  const [replyText, setReplyText] = useState('');

  const [editingVehicleId, setEditingVehicleId] = useState('');
  const [editVehicleForm, setEditVehicleForm] = useState(null);
  const [vehiclePriceConfirmation, setVehiclePriceConfirmation] = useState(null);
  const [vehiclePriceConfirmationError, setVehiclePriceConfirmationError] = useState('');
  const [vehiclePriceConfirming, setVehiclePriceConfirming] = useState(false);

  const [manualBookingForm, setManualBookingForm] = useState({
    customerMode: 'existing',
    customerId: '',
    existingFirstName: '',
    existingLastName: '',
    existingDateOfBirth: '',
    existingPhone: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    address: '',
    driverLicenseNumber: '',
    driverLicenseState: '',
    insuranceProvider: '',
    insurancePolicyNumber: '',
    vehicleId: '',
    pickupDate: adminBookingDateOffset(0),
    returnDate: adminBookingDateOffset(1),
    pickupTime: '9:00 AM',
    returnTime: '9:00 AM',
    onboardingDelivery: 'both',
    paymentCollectionPreference: 'customer_link',
  });
  const [manualBookingSubmitting, setManualBookingSubmitting] = useState(false);

  useEffect(() => {
    setManualBookingForm((current) => {
      const pickupAt = parseBookingDateTime(current.pickupDate, current.pickupTime);
      const returnAt = parseBookingDateTime(current.returnDate, current.returnTime);
      const minimumMilliseconds = Math.max(1, Number(bookingPolicy.minimum_rental_days || 1)) * 86400000;
      if (!pickupAt || (returnAt && returnAt.getTime() - pickupAt.getTime() >= minimumMilliseconds)) return current;
      const earliestReturn = new Date(pickupAt.getTime() + minimumMilliseconds);
      return { ...current, returnDate: localDateInput(earliestReturn), returnTime: formatAdminTime(earliestReturn), vehicleId: '' };
    });
  }, [bookingPolicy.minimum_rental_days]);

  const [vehicleForm, setVehicleForm] = useState(createEmptyVehicleForm);
  const [discountForm, setDiscountForm] = useState({
    code: '',
    discount_type: 'percentage',
    amount: '',
    max_redemptions: '',
    starts_at: '',
    expires_at: '',
    active: true,
    waive_security_deposit: false,
  });
  const [serviceFeeForm, setServiceFeeForm] = useState({
    name: '',
    service_type: '',
    amount: '0.00',
    taxable: true,
    active: true,
    description: '',
  });
  const [availabilityBlockForm, setAvailabilityBlockForm] = useState({
    vehicle_id: '',
    start_date: '',
    end_date: '',
    start_time: '9:00 AM',
    end_time: '9:00 AM',
    block_type: 'unavailable',
    label: '',
    notes: '',
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia('(max-width: 760px)');
    const syncMobileNav = () => {
      setIsMobileAdminNav(mediaQuery.matches);
      if (mediaQuery.matches) setNavCollapsed(true);
      else setNavCollapsed(false);
    };
    syncMobileNav();
    mediaQuery.addEventListener('change', syncMobileNav);
    return () => mediaQuery.removeEventListener('change', syncMobileNav);
  }, []);

  useEffect(() => {
    window.localStorage.setItem('rentmect_availability_types', JSON.stringify(availabilityTypes));
  }, [availabilityTypes]);

  useEffect(() => {
    if (!isMobileAdminNav || navCollapsed) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setNavCollapsed(true);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isMobileAdminNav, navCollapsed]);

  function notify(text, type = 'info', action = null) {
    const resolvedType = type === 'info' && /could not|failed|error|invalid|expired|cannot|must|required|choose|enter|complete|verify|unavailable/i.test(text)
      ? 'error'
      : type;
    if (resolvedType !== 'update') updateNoticeShownRef.current = false;
    setNotice({ text, type: resolvedType, action });
    window.clearTimeout(noticeTimeoutRef.current);
    if (resolvedType !== 'error' && !action) {
      noticeTimeoutRef.current = window.setTimeout(() => setNotice(null), 7000);
    }
  }

  useEffect(() => {
    if (!isAdminUser) return undefined;

    const checkForNewAdminBuild = async () => {
      if (document.visibilityState === 'hidden' || updateNoticeShownRef.current) return;
      const currentScript = document.querySelector('script[type="module"][src]')?.getAttribute('src') || '';
      if (!currentScript.includes('/assets/')) return;

      try {
        const checkUrl = new URL(window.location.href);
        checkUrl.searchParams.set('admin-build-check', String(Date.now()));
        const response = await fetch(checkUrl, {
          cache: 'no-store',
          headers: { Accept: 'text/html' },
        });
        if (!response.ok) return;
        const documentText = await response.text();
        const latestDocument = new DOMParser().parseFromString(documentText, 'text/html');
        const latestScript = latestDocument.querySelector('script[type="module"][src]')?.getAttribute('src') || '';
        if (!latestScript || latestScript === currentScript) return;

        updateNoticeShownRef.current = true;
        notify(
          'A newer Admin Portal version is available. Reload before continuing so customer and rental records are current.',
          'update',
          {
            label: 'Reload now',
            onClick: () => {
              const reloadUrl = new URL(window.location.href);
              reloadUrl.searchParams.set('admin-build', String(Date.now()));
              window.location.replace(reloadUrl.toString());
            },
          },
        );
      } catch {
        // A version check must never interrupt admin work when the network is down.
      }
    };

    void checkForNewAdminBuild();
    const intervalId = window.setInterval(checkForNewAdminBuild, 2 * 60 * 1000);
    window.addEventListener('focus', checkForNewAdminBuild);
    document.addEventListener('visibilitychange', checkForNewAdminBuild);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', checkForNewAdminBuild);
      document.removeEventListener('visibilitychange', checkForNewAdminBuild);
    };
  }, [isAdminUser]);

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
      setLoading(false);
    }
    init();
  }, []);

  useEffect(() => {
    async function checkAdminRole() {
      if (!session?.user) {
        setIsAdminUser(false);
        setAdminRoleChecking(false);
        return;
      }

      setAdminRoleChecking(true);
      const { data, error } = await supabase.rpc('is_admin');

      if (error) {
        setIsAdminUser(false);
        setAdminRoleChecking(false);
        return;
      }

      setIsAdminUser(data === true);
      setAdminRoleChecking(false);
    }

    checkAdminRole();
  }, [session]);

  useEffect(() => {
    if (isAdminUser) loadAllData({ force: false });
  }, [isAdminUser]);

  useEffect(() => {
    if (!isAdminUser || activeTab === 'dashboard') return;
    (ADMIN_TAB_DOMAINS[activeTab] || ['core']).forEach((domain) => {
      // Customer records must be current whenever an admin opens either place
      // where a renter can be selected. Do not trust a session-long domain cache.
      void loadAdminDomain(domain, {
        force: domain === 'customer-directory' && ['customers', 'new-booking'].includes(activeTab),
      });
    });
  }, [activeTab, isAdminUser]);

  useEffect(() => {
    if (!isAdminUser || !session?.user?.id) return;
    const sessionKey = `rentmect_admin_login_audited_${session.access_token?.slice(-16) || session.user.id}`;
    if (window.sessionStorage.getItem(sessionKey)) return;
    window.sessionStorage.setItem(sessionKey, '1');
    recordAdminAuditEvent('admin.login', 'admin_session', session.user.id, {
      portal: 'admin',
    });
  }, [isAdminUser, session?.user?.id, session?.access_token]);

  useEffect(() => {
    if (!isAdminUser) return undefined;
    const refreshTimers = new Map();
    let calendarRecoveryPoll;
    let lastRecoveryAt = 0;
    let recoveryInFlight = false;

    const calendarLoaders = {
      rentals: async () => {
        const result = await supabase
          .from('rentals')
          .select('*, vehicles(*), profiles!rentals_user_id_profiles_fkey(*)')
          .order('created_at', { ascending: false });
        if (!result.error) setRentals(result.data || []);
        return result.error;
      },
      pending_bookings: async () => {
        const result = await supabase
          .from('pending_bookings')
          .select('*')
          .neq('status', 'converted')
          .order('created_at', { ascending: false });
        if (!result.error) setPendingBookings(result.data || []);
        return result.error;
      },
      vehicle_availability_blocks: async () => {
        const result = await supabase
          .from('vehicle_availability_blocks')
          .select('*, vehicles(*)')
          .eq('active', true)
          .order('start_date', { ascending: true });
        if (!result.error) setAvailabilityBlocks(result.data || []);
        return result.error;
      },
      vehicles: async () => {
        const result = await supabase
          .from('vehicles')
          .select('*')
          .order('created_at', { ascending: false });
        if (!result.error) setVehicles(result.data || []);
        return result.error;
      },
      vehicle_maintenance_schedules: async () => {
        const result = await supabase
          .from('vehicle_maintenance_schedules')
          .select('*')
          .order('service_type');
        if (!result.error) setMaintenanceSchedules(result.data || []);
        return result.error;
      },
      rental_emergency_exceptions: async () => {
        const result = await supabase
          .from('rental_emergency_exceptions')
          .select('*, rentals(*, vehicles(*), profiles!rentals_user_id_profiles_fkey(*))')
          .order('created_at', { ascending: false });
        if (!result.error) setEmergencyExceptions(result.data || []);
        return result.error;
      },
    };

    const recordCalendarRefresh = (table, error) => {
      setDataHealth((current) => {
        const calendarLabels = {
          rentals: 'Rentals',
          pending_bookings: 'Booking holds',
          vehicle_availability_blocks: 'Calendar blocks',
          vehicles: 'Vehicles',
          vehicle_maintenance_schedules: 'Maintenance schedules',
          rental_emergency_exceptions: 'Emergency exceptions',
        };
        const label = calendarLabels[table];
        const otherErrors = (current.errors || []).filter((item) => item.label !== label);
        return {
          ...current,
          errors: error
            ? [...otherErrors, { label, message: userFacingPortalError(error, `${label} could not refresh.`) }]
            : otherErrors,
          lastUpdated: new Date().toISOString(),
        };
      });
    };

    const refreshCalendarDataset = async (table) => {
      if (document.visibilityState === 'hidden' || backgroundRefreshInFlightRef.current) return;
      const loader = calendarLoaders[table];
      if (!loader) return;
      const error = await loader();
      recordCalendarRefresh(table, error);
    };

    const scheduleCalendarDatasetRefresh = (table) => {
      window.clearTimeout(refreshTimers.get(table));
      refreshTimers.set(table, window.setTimeout(() => refreshCalendarDataset(table), 350));
    };

    const recoverCalendarSourceOfTruth = async ({ force = false } = {}) => {
      const now = Date.now();
      if (
        document.visibilityState === 'hidden' ||
        backgroundRefreshInFlightRef.current ||
        recoveryInFlight ||
        (!force && now - lastRecoveryAt < 30_000)
      ) return;
      recoveryInFlight = true;
      lastRecoveryAt = now;
      try {
        await Promise.all(Object.keys(calendarLoaders).map(refreshCalendarDataset));
      } finally {
        recoveryInFlight = false;
      }
    };

    const scheduleDomainRefresh = (domain) => {
      const timerKey = `domain:${domain}`;
      window.clearTimeout(refreshTimers.get(timerKey));
      refreshTimers.set(timerKey, window.setTimeout(() => {
        if (document.visibilityState !== 'hidden') void loadAdminDomain(domain, { force: true });
      }, 250));
    };
    const calendarChannel = supabase
      .channel('admin-calendar-source-of-truth')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rentals' }, () => scheduleCalendarDatasetRefresh('rentals'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_bookings' }, () => scheduleCalendarDatasetRefresh('pending_bookings'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_availability_blocks' }, () => scheduleCalendarDatasetRefresh('vehicle_availability_blocks'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => scheduleCalendarDatasetRefresh('vehicles'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_maintenance_schedules' }, () => scheduleCalendarDatasetRefresh('vehicle_maintenance_schedules'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rental_emergency_exceptions' }, () => scheduleCalendarDatasetRefresh('rental_emergency_exceptions'))
      .subscribe();
    const operationalChannel = supabase
      .channel('admin-payment-source-of-truth')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => scheduleDomainRefresh('customer-directory'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rental_extension_requests' }, () => {
        scheduleDomainRefresh('workflow');
        scheduleDomainRefresh('payments');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rental_payment_refunds' }, () => scheduleDomainRefresh('payments'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rental_payments' }, () => scheduleDomainRefresh('payments'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rental_charge_items' }, () => scheduleDomainRefresh('payments'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rental_deposit_allocations' }, () => scheduleDomainRefresh('payments'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stripe_reconciliation_issues' }, () => scheduleDomainRefresh('payments'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rental_step_completions' }, () => scheduleDomainRefresh('workflow'))
      .subscribe();
    calendarRecoveryPoll = window.setInterval(() => recoverCalendarSourceOfTruth({ force: true }), 5 * 60 * 1000);
    const recoverOnFocus = () => recoverCalendarSourceOfTruth();
    const recoverOnVisibility = () => {
      if (document.visibilityState === 'visible') recoverCalendarSourceOfTruth();
    };
    window.addEventListener('focus', recoverOnFocus);
    document.addEventListener('visibilitychange', recoverOnVisibility);

    return () => {
      refreshTimers.forEach((timer) => window.clearTimeout(timer));
      window.clearInterval(calendarRecoveryPoll);
      window.removeEventListener('focus', recoverOnFocus);
      document.removeEventListener('visibilitychange', recoverOnVisibility);
      supabase.removeChannel(calendarChannel);
      supabase.removeChannel(operationalChannel);
    };
  }, [isAdminUser]);

  const selectedRental = rentals.find((r) => r.id === selectedRentalId) || rentals[0];

  const documentsByRentalId = useMemo(() => {
    const grouped = {};
    documents.forEach((document) => {
      const rentalId = document.rental_id || document.rentals?.id;
      if (!rentalId) return;
      if (!grouped[rentalId]) grouped[rentalId] = [];
      grouped[rentalId].push(document);
    });
    return grouped;
  }, [documents]);

  const documentsByUserId = useMemo(() => {
    const grouped = {};
    documents.forEach((document) => {
      const userId = document.user_id || document.profiles?.id;
      if (!userId) return;
      if (!grouped[userId]) grouped[userId] = [];
      grouped[userId].push(document);
    });
    return grouped;
  }, [documents]);

  const paidRentals = useMemo(() => {
  return rentals.filter((r) => {
    const status = String(r?.status || '').toLowerCase();
    const paymentStatus = String(r?.payment_status || '').toLowerCase();
    const depositStatus = String(r?.deposit_status || '').toLowerCase();

    return (
      status !== 'cancelled' &&
      (
        paymentStatus === 'paid' ||
        isPartialPaymentStatus(paymentStatus) ||
        depositStatus === 'held' ||
        Boolean(r?.paid_at) ||
        ['documents_needed', 'document_review', 'ready_for_pickup', 'approved', 'active', 'overdue', 'return_initiated'].includes(status)
      )
    );
  });
}, [rentals]);

  const rentalManagerRentals = useMemo(() => {
    const currentIds = new Set(paidRentals.map((rental) => rental.id));
    return rentals.filter((rental) =>
      currentIds.has(rental.id) || ['completed', 'cancelled'].includes(String(rental.status || '').toLowerCase())
    );
  }, [rentals, paidRentals]);

  const dashboard = useMemo(() => {
    const active = paidRentals.filter((r) => ['ready_for_pickup', 'approved', 'active', 'overdue', 'return_initiated'].includes(r.status));
    const dueSoon = paidRentals.filter((r) =>
      !['completed', 'cancelled'].includes(r.status) &&
      isDueSoon(r.return_date, r.return_time)
    );
    const overdue = paidRentals.filter((r) => isOverdue(r.return_date, r.return_time, r.status));
    const monthRevenue = paidRentals
      .filter((r) => isThisMonth(r.paid_at || r.created_at) && r.payment_status === 'paid' && !['cancelled'].includes(r.status))
      .reduce((sum, r) => sum + Number(r.rental_total || 0) + Number(r.tax_amount || 0), 0);
    const deposits = paidRentals
      .filter((r) => ['held', 'adjustment_refund_due', 'release_pending'].includes(String(r.deposit_status || '').toLowerCase()))
      .reduce((sum, r) => sum + Number(r.deposit_held_amount || 0), 0);
    return { active, dueSoon, overdue, monthRevenue, deposits };
  }, [paidRentals]);

  const operationsQueue = useMemo(() => buildOperationsQueue({ rentals, documents, messages, reports, extensionRequests }), [rentals, documents, messages, reports, extensionRequests]);
  const paymentEvents = useMemo(() => buildPaymentEvents({
    rentals,
    rentalPayments,
    rentalRefunds,
    extensionRequests,
    rentalCharges,
    depositAllocations,
    stripeReconciliationIssues,
  }), [rentals, rentalPayments, rentalRefunds, extensionRequests, rentalCharges, depositAllocations, stripeReconciliationIssues]);

  const filteredRentals = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rentalManagerRentals.filter((r) =>
      rentalMatchesFilter(r, rentalFilter, { documents, extensionRequests, vehicles }) &&
      (!q ||
      [r.vehicles?.name, r.profiles?.full_name, r.profiles?.phone, r.profiles?.intended_vehicle_use, r.user_email, r.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
      )
    );
  }, [rentalManagerRentals, search, rentalFilter, documents, extensionRequests, vehicles]);

  async function handleLogin(event) {
    event.preventDefault();
    setAuthMessage('');
    const { error } = await supabase.auth.signInWithPassword(authForm);
    if (error) return setAuthMessage(error.message);
  }

  async function handleAdminForgotPassword() {
    const email = authForm.email.trim();
    if (!email) {
      setAuthMessage('Enter the admin email first, then use forgot password.');
      return;
    }

    const redirectTo = import.meta.env.VITE_ADMIN_PORTAL_URL || window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setAuthMessage(error ? error.message : 'Password reset link sent. Check your email.');
  }

  async function signOut() {
    if (isAdminUser && session?.user?.id) {
      await recordAdminAuditEvent('admin.logout', 'admin_session', session.user.id, { portal: 'admin' });
    }
    await supabase.auth.signOut();
    setSession(null);
    setIsAdminUser(false);
  }

  async function recordAdminAuditEvent(action, entityType, entityId, metadata = {}) {
    const { error } = await supabase.rpc('record_admin_audit_event', {
      p_action: action,
      p_entity_type: entityType,
      p_entity_id: entityId ? String(entityId) : null,
      p_metadata: metadata,
    });
    if (error && !/record_admin_audit_event|schema cache/i.test(error.message || '')) {
      console.warn('Audit event could not be recorded', error.message);
    }
  }

  function recordAdminResults(results) {
    const attemptedLabels = new Set(results.map(([label]) => label));
    const nextErrors = results
      .filter(([, result]) => Boolean(result?.error))
      .map(([label, result]) => ({ label, message: userFacingPortalError(result.error, `${label} could not refresh.`) }));
    setDataHealth((current) => ({
      refreshing: false,
      errors: [...(current.errors || []).filter((item) => !attemptedLabels.has(item.label)), ...nextErrors],
      lastUpdated: new Date().toISOString(),
    }));
    return nextErrors;
  }

  async function loadDashboardSnapshot({ force = false } = {}) {
    if (!force && loadedAdminDomainsRef.current.has('snapshot')) return;
    if (adminDomainLoadsRef.current.has('snapshot')) return adminDomainLoadsRef.current.get('snapshot');
    const request = (async () => {
      const snapshotResult = await withRequestDeadline(supabase.rpc('get_admin_dashboard_snapshot'), 'Dashboard snapshot');
      if (snapshotResult.error && /get_admin_dashboard_snapshot|schema cache|does not exist/i.test(snapshotResult.error.message || '')) {
        await loadAdminDomain('core', { force });
        return;
      }
      if (snapshotResult.data) setDashboardSnapshot(snapshotResult.data);
      const errors = recordAdminResults([['Dashboard snapshot', snapshotResult]]);
      if (!errors.length) loadedAdminDomainsRef.current.add('snapshot');
    })().finally(() => adminDomainLoadsRef.current.delete('snapshot'));
    adminDomainLoadsRef.current.set('snapshot', request);
    return request;
  }

  async function loadAdminDomain(domain, { force = false } = {}) {
    if (domain === 'snapshot') return loadDashboardSnapshot({ force });
    if (!force && loadedAdminDomainsRef.current.has(domain)) return;
    if (adminDomainLoadsRef.current.has(domain)) return adminDomainLoadsRef.current.get(domain);
    setDataHealth((current) => ({ ...current, refreshing: true }));
    const request = (async () => {
      let results = [];
      if (domain === 'customer-directory') {
        setCustomerDirectoryState((current) => ({ ...current, loading: true, error: '' }));
        const fetchProfiles = () => supabase
          .from('profiles')
          .select('*')
          .is('customer_deleted_at', null)
          .order('created_at', { ascending: false });
        let directoryResult = await withRequestDeadline(fetchProfiles(), 'Customer directory');
        if (directoryResult.error) {
          directoryResult = await withRequestDeadline(fetchProfiles(), 'Customer directory retry', 12_000);
        }
        if (directoryResult.data) setProfiles(directoryResult.data);
        setCustomerDirectoryState({
          loading: false,
          error: directoryResult.error
            ? userFacingPortalError(directoryResult.error, 'Customer accounts could not refresh.')
            : '',
          lastUpdated: directoryResult.error ? null : new Date().toISOString(),
        });
        results = [['Customer directory', directoryResult]];
      } else if (domain === 'core') {
        const [vehiclesRes, rentalsRes, pendingBookingsRes, emergencyExceptionsRes, maintenanceSchedulesRes] = await Promise.all([
          withRequestDeadline(supabase.from('vehicles').select('*').order('created_at', { ascending: false }), 'Vehicles'),
          withRequestDeadline(supabase.from('rentals').select('*, vehicles(*), profiles!rentals_user_id_profiles_fkey(*)').order('created_at', { ascending: false }), 'Rentals'),
          withRequestDeadline(supabase.from('pending_bookings').select('*').neq('status', 'converted').order('created_at', { ascending: false }), 'Booking holds'),
          withRequestDeadline(supabase.from('rental_emergency_exceptions').select('*, rentals(*, vehicles(*), profiles!rentals_user_id_profiles_fkey(*))').order('created_at', { ascending: false }), 'Emergency exceptions'),
          withRequestDeadline(supabase.from('vehicle_maintenance_schedules').select('*').order('service_type'), 'Maintenance schedules'),
        ]);
        if (vehiclesRes.data) setVehicles(vehiclesRes.data);
        if (rentalsRes.data) setRentals(rentalsRes.data);
        if (pendingBookingsRes.data) setPendingBookings(pendingBookingsRes.data);
        if (emergencyExceptionsRes.data) setEmergencyExceptions(emergencyExceptionsRes.data);
        if (maintenanceSchedulesRes.data) setMaintenanceSchedules(maintenanceSchedulesRes.data);
        results = [['Vehicles', vehiclesRes], ['Rentals', rentalsRes], ['Booking holds', pendingBookingsRes], ['Emergency exceptions', emergencyExceptionsRes], ['Maintenance schedules', maintenanceSchedulesRes]];
      } else if (domain === 'workflow') {
        const [documentsRes, messagesRes, reportsRes, extensionsRes, stepCompletionsRes] = await Promise.all([
          withRequestDeadline(supabase.from('rental_documents').select('*, profiles!rental_documents_user_id_profiles_fkey(*), rentals(*, vehicles(*))').order('created_at', { ascending: false }), 'Documents'),
          withRequestDeadline(supabase.from('rental_messages').select('*, profiles!rental_messages_user_id_profiles_fkey(*), rentals(*, vehicles(*))').order('created_at', { ascending: true }), 'Messages'),
          withRequestDeadline(supabase.from('vehicle_reports').select('*, profiles(*), rentals(*, vehicles(*))').order('created_at', { ascending: false }), 'Reports'),
          withRequestDeadline(supabase.from('rental_extension_requests').select('*, rentals!rental_extension_requests_rental_id_fkey(*, vehicles(*), profiles!rentals_user_id_profiles_fkey(*))').order('created_at', { ascending: false }), 'Extensions'),
          withRequestDeadline(supabase.from('rental_step_completions').select('*').order('completed_at', { ascending: false }), 'Admin step completions'),
        ]);
        if (documentsRes.data) setDocuments(documentsRes.data);
        if (messagesRes.data) setMessages(messagesRes.data);
        if (reportsRes.data) setReports(reportsRes.data);
        if (extensionsRes.data) setExtensionRequests(extensionsRes.data);
        if (stepCompletionsRes.data) setRentalStepCompletions(stepCompletionsRes.data);
        results = [['Documents', documentsRes], ['Messages', messagesRes], ['Reports', reportsRes], ['Extensions', extensionsRes], ['Admin step completions', stepCompletionsRes]];
      } else if (domain === 'payments') {
        const [depositAllocationsRes, rentalPaymentsRes, rentalRefundsRes, rentalChargesRes, reconciliationIssuesRes] = await Promise.all([
          withRequestDeadline(supabase.from('rental_deposit_allocations').select('*').order('created_at', { ascending: false }), 'Deposits'),
          withRequestDeadline(supabase.from('rental_payments').select('*, rentals(*, vehicles(*), profiles!rentals_user_id_profiles_fkey(*))').order('created_at', { ascending: false }), 'Payments'),
          withRequestDeadline(supabase.from('rental_payment_refunds').select('*').order('created_at', { ascending: false }), 'Refunds'),
          withRequestDeadline(supabase.from('rental_charge_items').select('*, rentals(*, vehicles(*), profiles!rentals_user_id_profiles_fkey(*))').order('created_at', { ascending: false }), 'Additional charges'),
          withRequestDeadline(supabase.from('stripe_reconciliation_issues').select('*').order('created_at', { ascending: false }).limit(500), 'Stripe reconciliation'),
        ]);
        if (depositAllocationsRes.data) setDepositAllocations(depositAllocationsRes.data);
        if (rentalPaymentsRes.data) setRentalPayments(rentalPaymentsRes.data);
        if (rentalRefundsRes.data) setRentalRefunds(rentalRefundsRes.data);
        if (rentalChargesRes.data) setRentalCharges(rentalChargesRes.data);
        if (reconciliationIssuesRes.data) setStripeReconciliationIssues(reconciliationIssuesRes.data);
        setPaymentLoadError([depositAllocationsRes.error, rentalPaymentsRes.error, rentalRefundsRes.error, rentalChargesRes.error, reconciliationIssuesRes.error].filter(Boolean).map((error) => error.message).join(' '));
        results = [['Deposits', depositAllocationsRes], ['Payments', rentalPaymentsRes], ['Refunds', rentalRefundsRes], ['Additional charges', rentalChargesRes], ['Stripe reconciliation', reconciliationIssuesRes]];
      } else if (domain === 'templates') {
        const [emailRes, smsRes] = await Promise.all([
          withRequestDeadline(supabase.from('email_templates').select('id,template_key,name,subject,text_body,category,enabled').eq('category', 'manual').eq('enabled', true).order('name'), 'Email templates'),
          withRequestDeadline(supabase.from('sms_templates').select('id,template_key,name,body,category,enabled').eq('category', 'manual').eq('enabled', true).order('name'), 'Text templates'),
        ]);
        if (emailRes.data) setCustomerEmailTemplates(emailRes.data);
        if (smsRes.data) setSmsTemplates(smsRes.data);
        results = [['Email templates', emailRes], ['Text templates', smsRes]];
      } else if (domain === 'calendar') {
        const result = await withRequestDeadline(supabase.from('vehicle_availability_blocks').select('*, vehicles(*)').eq('active', true).order('start_date', { ascending: true }), 'Calendar blocks');
        if (result.data) setAvailabilityBlocks(result.data);
        results = [['Calendar blocks', result]];
      } else if (domain === 'settings') {
        const [discountsRes, feesRes, promotionsRes, pricingRes, automationRes, bookingPageRes, bookingPolicyRes] = await Promise.all([
          withRequestDeadline(supabase.from('discount_codes').select('*').order('created_at', { ascending: false }), 'Discounts'),
          withRequestDeadline(supabase.from('service_fees').select('*').order('created_at', { ascending: false }), 'Fees'),
          withRequestDeadline(supabase.from('site_promotions').select('*').order('updated_at', { ascending: false }), 'Promotions'),
          withRequestDeadline(supabase.from('under_25_pricing_settings').select('*').eq('id', true).maybeSingle(), 'Under-25 pricing'),
          withRequestDeadline(supabase.from('billing_automation_settings').select('*').eq('id', true).maybeSingle(), 'Billing automation'),
          withRequestDeadline(supabase.rpc('get_admin_booking_page_setting'), 'Booking page'),
          withRequestDeadline(supabase.rpc('get_admin_booking_policy'), 'Booking rules'),
        ]);
        if (discountsRes.data) setDiscountCodes(discountsRes.data);
        if (feesRes.data) setServiceFees(feesRes.data);
        if (promotionsRes.data) setSitePromotions(promotionsRes.data);
        if (pricingRes.data) setUnder25Pricing(pricingRes.data);
        if (automationRes.data) setBillingAutomation(automationRes.data);
        if (bookingPageRes.data?.[0]) setBookingPageSetting(bookingPageRes.data[0]);
        if (bookingPolicyRes.data?.[0]) setBookingPolicy(bookingPolicyRes.data[0]);
        results = [['Discounts', discountsRes], ['Fees', feesRes], ['Promotions', promotionsRes], ['Under-25 pricing', pricingRes], ['Billing automation', automationRes], ['Booking page', bookingPageRes], ['Booking rules', bookingPolicyRes]];
      } else if (domain === 'audit') {
        const result = await withRequestDeadline(supabase.from('admin_audit_logs').select('*').order('created_at', { ascending: false }).limit(750), 'Audit log');
        if (result.data) setAuditLogs(result.data);
        results = [['Audit log', result]];
      } else if (domain === 'maintenance-history') {
        const result = await withRequestDeadline(supabase.from('vehicle_maintenance_service_logs').select('*').order('completed_at', { ascending: false }).limit(500), 'Maintenance history');
        if (result.data) setMaintenanceServiceLogs(result.data);
        results = [['Maintenance history', result]];
      }
      const errors = recordAdminResults(results);
      if (!errors.length) loadedAdminDomainsRef.current.add(domain);
    })().finally(() => adminDomainLoadsRef.current.delete(domain));
    adminDomainLoadsRef.current.set(domain, request);
    return request;
  }

  async function loadAllData({ silent = false, domains = null, force = true } = {}) {
    if (!silent) setLoading(true);
    const requestedDomains = domains || [...new Set([
      ...(ADMIN_TAB_DOMAINS[activeTab] || ['core']),
      ...loadedAdminDomainsRef.current,
    ])];
    await Promise.all(requestedDomains.map((domain) => loadAdminDomain(domain, { force })));
    if (!silent) setLoading(false);
  }

  async function loadAllDataLegacy({ silent = false } = {}) {
    if (silent && backgroundRefreshInFlightRef.current) return;
    if (silent) backgroundRefreshInFlightRef.current = true;
    if (!silent) {
      setLoading(true);
      setDataHealth((current) => ({ ...current, refreshing: true }));
    }
    const [profilesRes, vehiclesRes, rentalsRes, pendingBookingsRes, documentsRes, messagesRes, reportsRes, extensionsRes, emergencyExceptionsRes, depositAllocationsRes, discountCodesRes, serviceFeesRes, sitePromotionsRes, availabilityBlocksRes, under25PricingRes, billingAutomationRes, bookingPageRes, bookingPolicyRes, auditLogsRes, rentalPaymentsRes, rentalRefundsRes, rentalChargesRes, customerEmailTemplatesRes, smsTemplatesRes, maintenanceSchedulesRes, maintenanceServiceLogsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('*')
        .is('customer_deleted_at', null)
        .order('created_at', { ascending: false }),

      supabase
        .from('vehicles')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('rentals')
        .select(`
          *,
          vehicles(*),
          profiles!rentals_user_id_profiles_fkey(*)
        `)
        .order('created_at', { ascending: false }),

      supabase
        .from('pending_bookings')
        .select('*')
        .neq('status', 'converted')
        .order('created_at', { ascending: false }),

      supabase
        .from('rental_documents')
        .select(`
          *,
          profiles!rental_documents_user_id_profiles_fkey(*),
          rentals(*, vehicles(*))
        `)
        .order('created_at', { ascending: false }),

      supabase
        .from('rental_messages')
        .select(`
          *,
          profiles!rental_messages_user_id_profiles_fkey(*),
          rentals(*, vehicles(*))
        `)
        .order('created_at', { ascending: true }),

      supabase
        .from('vehicle_reports')
        .select(`
          *,
          profiles(*),
          rentals(*, vehicles(*))
        `)
        .order('created_at', { ascending: false }),

      supabase
        .from('rental_extension_requests')
        .select(`
          *,
          rentals!rental_extension_requests_rental_id_fkey(
            *,
            vehicles(*),
            profiles!rentals_user_id_profiles_fkey(*)
          )
        `)
        .order('created_at', { ascending: false }),

      supabase
        .from('rental_emergency_exceptions')
        .select('*, rentals(*, vehicles(*), profiles!rentals_user_id_profiles_fkey(*))')
        .order('created_at', { ascending: false }),

      supabase
        .from('rental_deposit_allocations')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('discount_codes')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('service_fees')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('site_promotions')
        .select('*')
        .order('updated_at', { ascending: false }),

      supabase
        .from('vehicle_availability_blocks')
        .select('*, vehicles(*)')
        .eq('active', true)
        .order('start_date', { ascending: true }),

      supabase
        .from('under_25_pricing_settings')
        .select('*')
        .eq('id', true)
        .maybeSingle(),

      supabase
        .from('billing_automation_settings')
        .select('*')
        .eq('id', true)
        .maybeSingle(),

      supabase.rpc('get_admin_booking_page_setting'),

      supabase.rpc('get_admin_booking_policy'),

      supabase
        .from('admin_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(750),

      supabase
        .from('rental_payments')
        .select('*, rentals(*, vehicles(*), profiles!rentals_user_id_profiles_fkey(*))')
        .order('created_at', { ascending: false }),

      supabase
        .from('rental_payment_refunds')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('rental_charge_items')
        .select('*, rentals(*, vehicles(*), profiles!rentals_user_id_profiles_fkey(*))')
        .order('created_at', { ascending: false }),

      supabase
        .from('email_templates')
        .select('id,template_key,name,subject,text_body,category,enabled')
        .eq('category', 'manual')
        .eq('enabled', true)
        .order('name'),

      supabase
        .from('sms_templates')
        .select('id,template_key,name,body,category,enabled')
        .eq('category', 'manual')
        .eq('enabled', true)
        .order('name'),

      supabase
        .from('vehicle_maintenance_schedules')
        .select('*')
        .order('service_type'),

      supabase
        .from('vehicle_maintenance_service_logs')
        .select('*')
        .order('completed_at', { ascending: false })
      .limit(500),
    ]);

    const dataErrors = [
      ['Customers', profilesRes.error],
      ['Vehicles', vehiclesRes.error],
      ['Rentals', rentalsRes.error],
      ['Booking holds', pendingBookingsRes.error],
      ['Documents', documentsRes.error],
      ['Messages', messagesRes.error],
      ['Reports', reportsRes.error],
      ['Extensions', extensionsRes.error],
      ['Emergency exceptions', emergencyExceptionsRes.error],
      ['Deposits', depositAllocationsRes.error],
      ['Discounts', discountCodesRes.error],
      ['Fees', serviceFeesRes.error],
      ['Promotions', sitePromotionsRes.error],
      ['Calendar blocks', availabilityBlocksRes.error],
      ['Under-25 pricing', under25PricingRes.error],
      ['Billing automation', billingAutomationRes.error],
      ['Booking page', bookingPageRes.error],
      ['Booking rules', bookingPolicyRes.error],
      ['Audit log', auditLogsRes.error],
      ['Payments', rentalPaymentsRes.error],
      ['Refunds', rentalRefundsRes.error],
      ['Additional charges', rentalChargesRes.error],
      ['Email templates', customerEmailTemplatesRes.error],
      ['Text templates', smsTemplatesRes.error],
      ['Maintenance schedules', maintenanceSchedulesRes.error],
      ['Maintenance history', maintenanceServiceLogsRes.error],
    ].filter(([, error]) => Boolean(error)).map(([label, error]) => ({
      label,
      message: userFacingPortalError(error, `${label} could not refresh.`),
    }));

    updateFetchedState(setProfiles, profilesRes.data, silent);
    updateFetchedState(setVehicles, vehiclesRes.data, silent);
    updateFetchedState(setRentals, rentalsRes.data, silent);
    updateFetchedState(setPendingBookings, pendingBookingsRes.data, silent);
    updateFetchedState(setDocuments, documentsRes.data, silent);
    updateFetchedState(setMessages, messagesRes.data, silent);
    updateFetchedState(setReports, reportsRes.data, silent);
    updateFetchedState(setExtensionRequests, extensionsRes.data, silent);
    updateFetchedState(setEmergencyExceptions, emergencyExceptionsRes.data, silent);
    updateFetchedState(setDepositAllocations, depositAllocationsRes.data, silent);
    updateFetchedState(setDiscountCodes, discountCodesRes.data, silent);
    updateFetchedState(setServiceFees, serviceFeesRes.data, silent);
    updateFetchedState(setSitePromotions, sitePromotionsRes.data, silent);
    updateFetchedState(setAvailabilityBlocks, availabilityBlocksRes.data, silent);
    updateFetchedState(setUnder25Pricing, under25PricingRes.data, silent);
    updateFetchedState(setBillingAutomation, billingAutomationRes.data, silent);
    updateFetchedState(setBookingPageSetting, bookingPageRes.data?.[0], silent);
    updateFetchedState(setBookingPolicy, bookingPolicyRes.data?.[0], silent);
    updateFetchedState(setAuditLogs, auditLogsRes.data, silent);
    updateFetchedState(setRentalPayments, rentalPaymentsRes.data, silent);
    updateFetchedState(setRentalRefunds, rentalRefundsRes.data, silent);
    updateFetchedState(setRentalCharges, rentalChargesRes.data, silent);
    setPaymentLoadError(
      [rentalsRes.error, extensionsRes.error, depositAllocationsRes.error, rentalPaymentsRes.error, rentalRefundsRes.error, rentalChargesRes.error]
        .filter(Boolean)
        .map((error) => error.message)
        .join(' ')
    );
    updateFetchedState(setCustomerEmailTemplates, customerEmailTemplatesRes.data, silent);
    updateFetchedState(setSmsTemplates, smsTemplatesRes.data, silent);
    updateFetchedState(setMaintenanceSchedules, maintenanceSchedulesRes.data, silent);
    updateFetchedState(setMaintenanceServiceLogs, maintenanceServiceLogsRes.data, silent);
    setDataHealth((current) => {
      if (silent && JSON.stringify(current.errors || []) === JSON.stringify(dataErrors)) return current;
      return {
        refreshing: false,
        errors: dataErrors,
        lastUpdated: new Date().toISOString(),
      };
    });
    if (silent) backgroundRefreshInFlightRef.current = false;
    if (!silent) setLoading(false);
  }

  async function isVehicleAvailable(vehicleId, startDate, pickupTime, endDate, returnTime) {
    const vehicle = vehicles.find((item) => item.id === vehicleId);
    if (BLOCKING_VEHICLE_STATUSES.includes(String(vehicle?.status || '').toLowerCase())) {
      return false;
    }

    const { data, error } = await supabase.rpc('get_admin_calendar_fleet_availability', {
      p_pickup_date: startDate,
      p_pickup_time: pickupTime,
      p_return_date: endDate,
      p_return_time: returnTime,
    });
    if (error) {
      notify(error.message);
      return false;
    }
    return Boolean((data || []).find((item) => item.vehicle_id === vehicleId)?.available);
  }

  async function updateRentalStatus(id, status, options = {}) {
    const rental = rentals.find((item) => item.id === id);
    const nextVehicleStatus = vehicleStatusForRentalStatus(status);
    const applyLocalStatus = (rentalUpdates = {}, vehicleUpdates = {}) => {
      setRentals((current) => current.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          status,
          ...rentalUpdates,
          vehicles: item.vehicles ? { ...item.vehicles, status: nextVehicleStatus || item.vehicles.status, ...vehicleUpdates } : item.vehicles,
        };
      }));
      if (rental?.vehicle_id && nextVehicleStatus) {
        setVehicles((current) => current.map((vehicle) =>
          vehicle.id === rental.vehicle_id ? { ...vehicle, status: nextVehicleStatus, ...vehicleUpdates } : vehicle
        ));
      }
    };

    if (status === 'active') {
      const enteredMileage = options.startingMileage;
      if (enteredMileage === undefined || enteredMileage === null) {
        return notify('Open the rental row and enter starting mileage before marking pickup.');
      }
      const startingMileage = parseMileageInput(enteredMileage);
      if (startingMileage === null) return notify('Starting mileage must be a whole number.');
      if (Number(rental?.vehicles?.current_mileage || 0) > 0 && startingMileage < Number(rental.vehicles.current_mileage)) {
        return notify(`Starting mileage cannot be below the vehicle's current mileage (${formatMiles(rental.vehicles.current_mileage)}).`);
      }

      const { data, error } = await supabase.rpc('admin_mark_rental_active', {
        p_rental_id: id,
        p_starting_mileage: startingMileage,
        p_override_missing_requirements: false,
        p_missing_requirements: [],
      });
      if (error) return notify(error.message);
      if (data) {
        setRentals((current) => current.map((item) =>
          item.id === id
            ? { ...item, ...data, vehicles: item.vehicles ? { ...item.vehicles, status: 'rented', current_mileage: startingMileage } : item.vehicles }
            : item
        ));
        if (data.vehicle_id) {
          setVehicles((current) => current.map((vehicle) =>
            vehicle.id === data.vehicle_id ? { ...vehicle, status: 'rented', current_mileage: startingMileage } : vehicle
          ));
        }
      } else {
        applyLocalStatus({ starting_mileage: startingMileage }, { current_mileage: startingMileage });
      }
      notify(rentalTransitionNotice(rental, 'active'), 'success');
      return;
    }

    if (status === 'completed') {
      const endingMileage = parseMileageInput(options.endingMileage);
      const { data, error } = await supabase.rpc('admin_complete_rental_return', {
        p_rental_id: id,
        p_ending_mileage: endingMileage,
      });
      if (error) return notify(error.message);
      applyLocalStatus(data || {
        ending_mileage: endingMileage,
        miles_driven: calculateMilesDriven(rental?.starting_mileage, endingMileage),
      }, { current_mileage: endingMileage });
      notify(rentalTransitionNotice(rental, 'completed'), 'success');
      return;
    }

    if (status === 'cancelled') {
      const { error } = await supabase.rpc('admin_cancel_rental', {
        p_rental_id: id,
        p_reason: options.reason || 'Cancelled by admin',
      });
      if (error) return notify(error.message);
      applyLocalStatus();
      notify(rentalTransitionNotice(rental, 'cancelled'), 'success');
      return;
    }

    const { error } = await supabase.from('rentals').update({ status }).eq('id', id);
    if (error) return notify(error.message);
    if (rental?.vehicle_id && nextVehicleStatus) {
      const { error: vehicleError } = await supabase
        .from('vehicles')
        .update({ status: nextVehicleStatus })
        .eq('id', rental.vehicle_id);
      if (vehicleError) return notify(vehicleError.message);
    }
    applyLocalStatus();
    notify(rentalTransitionNotice(rental, status), 'success');
  }

  async function updateRentalPaymentDeadline(rental, paymentDueAt, reason) {
    const { data, error } = await supabase.rpc('admin_set_rental_payment_deadline', {
      p_rental_id: rental.id,
      p_payment_due_at: paymentDueAt,
      p_reason: reason.trim(),
    });
    if (error) {
      notify(error.message);
      return null;
    }
    if (data) {
      setRentals((current) => current.map((item) => item.id === rental.id
        ? { ...item, ...data, vehicles: item.vehicles, profiles: item.profiles }
        : item));
    }
    notify(`Payment deadline changed to ${formatEasternDateTime(data?.payment_due_at || paymentDueAt)}.`, 'success');
    return data;
  }

  async function activateRentalWithEmergencyException(rental, form) {
    const { data, error } = await supabase.rpc('admin_activate_rental_with_emergency_exception', {
      p_rental_id: rental.id,
      p_exception_scopes: form.scopes,
      p_reason: form.reason.trim(),
      p_evidence_note: form.evidenceNote.trim() || null,
      p_expires_at: new Date(form.expiresAt).toISOString(),
      p_starting_mileage: parseMileageInput(form.startingMileage),
      p_confirmation: form.confirmation.trim(),
    });
    if (error) {
      notify(error.message);
      return false;
    }
    if (data) setEmergencyExceptions((current) => [data, ...current.filter((item) => item.id !== data.id)]);
    await loadAllData({ silent: true });
    notify('Emergency exception recorded. The rental is active, every incomplete procedure remains visible, and the owner alert was queued.', 'success');
    return true;
  }

  async function addEmergencyExceptionScope(rental, form) {
    const { data, error } = await supabase.rpc('admin_add_rental_emergency_exception_scope', {
      p_rental_id: rental.id,
      p_scope: form.scope,
      p_reason: form.reason.trim(),
      p_evidence_note: form.evidenceNote.trim() || null,
      p_expires_at: new Date(form.expiresAt).toISOString(),
      p_confirmation: form.confirmation.trim(),
    });
    if (error) {
      notify(error.message);
      return false;
    }
    if (data) {
      setEmergencyExceptions((current) => [
        data,
        ...current.filter((item) =>
          item.id !== data.id && !(item.rental_id === rental.id && item.status === 'active')
        ),
      ]);
    }
    notify(`${EMERGENCY_SCOPE_LABELS[form.scope] || prettyStatus(form.scope)} bypass recorded. No other step was bypassed and the vehicle was not released.`, 'success');
    return true;
  }

  async function resolveEmergencyExceptionScope(exceptionId, scope) {
    const { data, error } = await supabase.rpc('admin_resolve_rental_emergency_exception_scope', {
      p_exception_id: exceptionId,
      p_scope: scope,
      p_resolution_note: `${prettyStatus(scope)} verified in the booking record.`,
    });
    if (error) return notify(error.message);
    setEmergencyExceptions((current) => current.map((item) => item.id === exceptionId ? data : item));
    notify(`${prettyStatus(scope)} exception resolved from the actual booking record.`, 'success');
  }

  async function completeRentalReturn(rental, inspection = {}) {
    if (!rental?.id) return;

    if (inspection.damageFound) {
      const photoPaths = [];
      for (const file of inspection.files || []) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
        const path = `${rental.user_id || 'admin'}/return-damage/${rental.id}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from(DOCUMENT_BUCKET)
          .upload(path, file, { upsert: false });
        if (uploadError) return notify(uploadError.message);
        photoPaths.push(path);
      }

      const reportPayload = {
        rental_id: rental.id,
        user_id: rental.user_id,
        vehicle_id: rental.vehicle_id,
        status: 'open',
        description: inspection.damageNote || 'Damage found during admin return inspection.',
        report_type: 'admin_return_damage',
        issue_type: inspection.issueType || 'damage',
        photo_paths: photoPaths,
        deposit_held_amount: Number(rental.security_deposit || 0),
        admin_notes: inspection.damageNote || '',
      };
      const { data: report, error: reportError } = await supabase
        .from('vehicle_reports')
        .insert(reportPayload)
        .select('*, profiles(*), rentals(*, vehicles(*))')
        .single();
      if (reportError) return notify(reportError.message);
      if (report) setReports((current) => [report, ...current]);

      const issueLabel = prettyStatus(inspection.issueType || 'damage').toLowerCase();
      const customerMessage = [
        `RETURN REVIEW OPENED: Rent Me CT opened a ${issueLabel} review for your returned rental.`,
        'Your security deposit is being held while the review is completed.',
        inspection.damageNote ? `Admin note: ${inspection.damageNote}` : 'We will update you when the case is resolved.',
      ].join(' ');

      const { data: messageData, error: messageError } = await supabase
        .from('rental_messages')
        .insert({
          rental_id: rental.id,
          user_id: rental.user_id,
          sender_role: 'admin',
          message: customerMessage,
          read_by_admin: true,
        })
        .select('*, profiles!rental_messages_user_id_profiles_fkey(*), rentals(*, vehicles(*))')
        .single();
      if (messageError) return notify(messageError.message);
      if (messageData) setMessages((current) => [...current, messageData]);
    }

    if (inspection.customerAction && inspection.customerAction !== 'none') {
      const customerStatus = inspection.customerAction === 'block' ? 'blocked' : 'review_required';
      const { data: updatedProfile, error: profileError } = await supabase.rpc('admin_set_customer_status', {
        p_user_id: rental.user_id,
        p_customer_status: customerStatus,
        p_block_reason: inspection.damageNote || `${prettyStatus(inspection.issueType || 'damage')} case opened from return inspection.`,
      });
      if (profileError) return notify(profileError.message);
      if (updatedProfile) {
        setProfiles((current) => current.map((profile) => profile.id === updatedProfile.id ? updatedProfile : profile));
        setRentals((current) => current.map((item) =>
          item.user_id === updatedProfile.id ? { ...item, profiles: { ...(item.profiles || {}), ...updatedProfile } } : item
        ));
      }
    }

    const depositDecision = inspection.damageFound ? 'hold' : inspection.depositDecision || 'release';
    const vehicleDisposition = inspection.damageFound ? 'maintenance' : inspection.vehicleDisposition || 'available';
    const endingMileage = inspection.mileageOverride ? null : parseMileageInput(inspection.endingMileage);
    const { data: completedRental, error: inspectionError } = await supabase.rpc('admin_inspect_and_complete_rental_return', {
      p_rental_id: rental.id,
      p_ending_mileage: endingMileage,
      p_mileage_checked: Boolean(inspection.mileageChecked),
      p_fuel_checked: Boolean(inspection.fuelChecked),
      p_damage_checked: Boolean(inspection.damageChecked),
      p_damage_found: Boolean(inspection.damageFound),
      p_deposit_decision: depositDecision,
      p_notes: inspection.damageNote || null,
      p_vehicle_disposition: vehicleDisposition,
      p_mileage_override: Boolean(inspection.mileageOverride),
    });
    if (inspectionError) return notify(inspectionError.message);

    setRentals((current) => current.map((item) => item.id === rental.id ? {
      ...item,
      ...completedRental,
      vehicles: item.vehicles ? {
        ...item.vehicles,
        status: vehicleDisposition,
        current_mileage: endingMileage ?? item.vehicles.current_mileage,
      } : item.vehicles,
    } : item));
    setVehicles((current) => current.map((vehicle) => vehicle.id === rental.vehicle_id ? {
      ...vehicle,
      status: vehicleDisposition,
      current_mileage: endingMileage ?? vehicle.current_mileage,
    } : vehicle));
    setEmergencyExceptions((current) => current.map((exception) =>
      exception.rental_id === rental.id && exception.status === 'active'
        ? {
          ...exception,
          status: 'revoked',
          resolved_at: new Date().toISOString(),
          resolution_note: 'Automatically closed when the rental return was completed.',
        }
        : exception
    ));
    notify(
      inspection.mileageOverride
        ? 'Return closed with a mileage override. Enter the returning mileage as soon as possible so maintenance tracking remains accurate.'
        : vehicleDisposition === 'available'
          ? 'Return inspected and rental closed. The vehicle is available again.'
          : 'Return inspected and rental closed. The vehicle is held out of service.',
      'success',
    );
    return true;
  }

  async function releaseSecurityDeposit(rental) {
    if (!rental?.id) return;
    const amount = Number(rental.deposit_held_amount || rental.security_deposit || 0);
    const confirmed = window.confirm(`Refund ${money(amount)} of the captured Stripe payment to this customer now?`);
    if (!confirmed) return;

    const { data, error } = await supabase.functions.invoke('stripe-web-hook', {
      body: {
        action: 'release_deposit',
        rentalId: rental.id,
        reason: 'Released manually from the admin portal.',
      },
    });
    if (error || data?.error) return notify(data?.error || error.message);

    const nextStatus = data?.status === 'succeeded' || data?.status === 'released' ? 'released' : 'release_pending';
    setRentals((current) => current.map((item) => item.id === rental.id ? {
      ...item,
      deposit_status: nextStatus,
      deposit_refund_id: data?.refundId || item.deposit_refund_id,
      deposit_release_due_at: null,
      deposit_released_at: nextStatus === 'released' ? new Date().toISOString() : item.deposit_released_at,
    } : item));
    notify(nextStatus === 'released' ? 'Security deposit refund submitted successfully.' : 'Security deposit refund is processing.', 'success');
    loadAllData({ silent: true });
  }

  async function refundRentalPayment(rental, refund) {
    if (!rental?.id) return false;
    const amount = Number(refund?.amount || 0);
    const reason = String(refund?.reason || '').trim();
    if (!Number.isFinite(amount) || amount < 0.5) {
      notify('Refund amount must be at least $0.50.');
      return false;
    }
    if (reason.length < 5) {
      notify('Enter a refund reason of at least 5 characters.');
      return false;
    }

    const refundRequestId = crypto.randomUUID();
    const { data, error } = await supabase.functions.invoke('stripe-web-hook', {
      body: {
        action: 'refund_rental_payment',
        rentalId: rental.id,
        amountCents: Math.round(amount * 100),
        reason,
        refundRequestId,
      },
    });
    if (error || data?.error) {
      let detail = data?.error || error?.message || 'The Stripe refund could not be submitted.';
      try {
        const payload = await error?.context?.clone?.().json();
        detail = payload?.error || detail;
      } catch {
        // Keep the function error message.
      }
      notify(detail);
      return false;
    }

    setRentalRefunds((current) => [{
      id: refundRequestId,
      rental_id: rental.id,
      stripe_refund_id: data.refundId || null,
      amount,
      reason,
      status: data.status || 'pending',
      created_at: new Date().toISOString(),
    }, ...current.filter((item) => item.id !== refundRequestId)]);
    await loadAllData({ silent: true });
    notify(`Stripe refund of ${money(amount)} submitted. The security deposit remains protected separately.`, 'success');
    return true;
  }

  async function recordLocalDepositRelease(rental) {
    const allocations = depositAllocations.filter((item) =>
      item.holder_rental_id === rental.id &&
      item.payment_provider === 'local' &&
      ['held', 'refund_due_inspection', 'failed'].includes(item.status)
    );
    const amount = allocations.reduce((sum, item) => sum + Math.max(0, Number(item.amount_held || 0) - Number(item.amount_released || 0)), 0);
    if (!window.confirm(`Confirm that ${money(amount)} was actually returned to the customer outside Stripe? This records the external deposit return in the audit ledger.`)) return;
    const { data, error } = await supabase.rpc('admin_record_local_deposit_release', { p_rental_id: rental.id });
    if (error) return notify(error.message);
    setRentals((current) => current.map((item) => item.id === rental.id ? { ...item, ...data } : item));
    await loadAllData({ silent: true });
    notify('External deposit return recorded.', 'success');
  }

  async function recordTestPayment(rental, payment = {}) {
    const id = rental?.id;
    if (!id) return false;
    const amount = Number(payment.amount);
    const paymentMethod = String(payment.paymentMethod || '').trim();
    const { data, error } = await supabase.rpc('record_admin_local_rental_payment', {
      p_rental_id: id,
      p_amount: amount,
      p_payment_method: paymentMethod,
    });
    if (error) {
      notify(error.message);
      return false;
    }

    const paidRental = data || rentals.find((rental) => rental.id === id);
    if (paidRental?.vehicle_id) {
      setRentals((current) => current.map((rental) =>
        rental.id === id
          ? {
              ...rental,
              ...paidRental,
              payment_status: 'paid',
              deposit_status: 'held',
            }
          : rental
      ));
    }

    const { data: alertData, error: alertError } = await supabase.functions.invoke('send-rental-due-reminders', {
      body: { adminApprovalRentalId: id },
    });

    if (alertError || alertData?.error) {
      notify(`External ${externalPaymentMethodLabel(paymentMethod).toLowerCase()} payment of ${money(amount)} was recorded. Admin SMS alert did not send: ${alertError?.message || alertData.error}`);
    } else {
      notify(`${externalPaymentMethodLabel(paymentMethod)} payment of ${money(amount)} recorded. Admin approval SMS sent.`, 'success');
    }
    return true;
  }

  async function decideExtension(id, approve) {
    const request = extensionRequests.find((item) => item.id === id);
    const extensionInsurance = documents
      .filter((document) =>
        document.extension_request_id === id &&
        document.document_type === 'insurance'
      )
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
    if (approve && extensionInsurance?.status !== 'approved') {
      notify('Open and approve the new extension insurance before approving this request.');
      return;
    }
    const customer = request?.rentals?.profiles?.full_name || 'this customer';
    const action = approve
      ? `Approve the extension for ${customer} through ${formatRentalDate(request?.requested_return_date, request?.requested_return_time)} and send the payment notice to the customer's portal and email? The dates will be held while payment is pending; opted-in SMS delivery will follow.`
      : `Reject this extension request for ${customer}?`;
    if (!window.confirm(action)) return;
    const { data, error } = await supabase.rpc('decide_admin_rental_extension', {
      p_extension_request_id: id,
      p_approve: approve,
    });
    if (error) return notify(error.message);
    setExtensionRequests((current) => current.map((request) =>
      request.id === id ? { ...request, ...(data || {}), status: approve ? 'approved_pending_payment' : 'rejected' } : request
    ));
    notify(approve ? 'Extension approved. The portal payment notice and transactional email were queued; opted-in SMS delivery will follow. The calendar hold is active.' : 'Extension rejected.', 'success');
  }

  async function recordExtensionPayment(id) {
    const request = extensionRequests.find((item) => item.id === id);
    const extensionInsurance = documents
      .filter((document) =>
        document.extension_request_id === id &&
        document.document_type === 'insurance'
      )
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
    if (extensionInsurance?.status !== 'approved') {
      notify('Approve the new extension insurance before recording payment.');
      return;
    }
    if (!window.confirm(`Record ${money(request?.extension_total_amount || 0)} as received outside Stripe and activate this extension?`)) return;
    const { error } = await supabase.rpc('record_admin_local_rental_extension_payment', {
      p_extension_request_id: id,
    });
    if (error) return notify(error.message);
    notify('Extension payment recorded and the rental return window is updated.', 'success');
    loadAllData();
  }

  async function cancelApprovedExtension(id) {
    const request = extensionRequests.find((item) => item.id === id);
    if (!window.confirm(`Cancel this approved extension${request?.rentals?.profiles?.full_name ? ` for ${request.rentals.profiles.full_name}` : ''} and release its calendar hold?`)) return;
    const { data, error } = await supabase.rpc('cancel_admin_approved_extension', { p_extension_request_id: id });
    if (error) return notify(error.message);
    setExtensionRequests((current) => current.map((request) => request.id === id ? { ...request, ...data } : request));
    await loadAllData({ silent: true });
    notify('Approved extension cancelled and its calendar hold released.', 'success');
  }

  async function addRentalCharge(rentalId, charge) {
    const { data, error } = await supabase.rpc('admin_add_rental_charge', {
      p_rental_id: rentalId,
      p_name: charge.name,
      p_charge_type: charge.chargeType,
      p_amount: Number(charge.amount),
      p_taxable: Boolean(charge.taxable),
      p_description: charge.description || null,
    });
    if (error) {
      notify(error.message);
      return false;
    }
    setRentalCharges((current) => [data, ...current]);
    notify('Charge added. The secure payment-link email was queued, and you can also text the link or charge the saved card now.', 'success');
    return true;
  }

  async function previewRentalAmendment(rental, form) {
    const { data, error } = await supabase.rpc('admin_preview_rental_amendment', {
      p_rental_id: rental.id,
      p_vehicle_id: form.vehicleId,
      p_pickup_date: form.pickupDate,
      p_pickup_time: form.pickupTime,
      p_return_date: form.returnDate,
      p_return_time: form.returnTime,
      p_daily_rate: form.dailyRate === '' ? null : Number(form.dailyRate),
      p_security_deposit: form.securityDeposit === '' ? null : Number(form.securityDeposit),
    });
    if (error) throw error;
    return data;
  }

  async function applyRentalAmendment(rental, form, idempotencyKey) {
    const { data, error } = await supabase.rpc('admin_apply_rental_amendment', {
      p_rental_id: rental.id,
      p_vehicle_id: form.vehicleId,
      p_pickup_date: form.pickupDate,
      p_pickup_time: form.pickupTime,
      p_return_date: form.returnDate,
      p_return_time: form.returnTime,
      p_daily_rate: form.dailyRate === '' ? null : Number(form.dailyRate),
      p_security_deposit: form.securityDeposit === '' ? null : Number(form.securityDeposit),
      p_reason: form.reason.trim(),
      p_admin_notes: form.adminNotes,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
    await loadAllData({ silent: true });
    const amendment = data?.amendment;
    if (amendment?.settlement_status === 'customer_charge_pending') {
      notify(`Rental updated. ${money(amendment.total_delta)} was added to Charge customer.`, 'success');
    } else if (amendment?.settlement_status === 'customer_credit_due') {
      notify(`Rental updated. Customer credit due: ${money(amendment.credit_amount)}. The original payment was preserved.`, 'success');
    } else if (amendment?.requires_customer_resign) {
      notify('Rental updated. The customer must sign the revised agreement before pickup.', 'success');
    } else {
      notify('Rental updated and calendar availability refreshed.', 'success');
    }
    return data;
  }

  async function waiveRentalCharge(id) {
    const { data, error } = await supabase.rpc('admin_waive_rental_charge', { p_charge_id: id });
    if (error) return notify(error.message);
    setRentalCharges((current) => current.map((charge) => charge.id === id ? data : charge));
    notify('Charge waived.', 'success');
  }

  async function chargeRentalSavedCard(charge, options = {}) {
    if (!charge?.id) return false;
    const confirmed = options.skipConfirmation || window.confirm(`Charge the customer's saved card ${money(charge.total_amount)} for “${charge.name}”? This attempts the charge immediately.`);
    if (!confirmed) return false;
    const { data, error } = await supabase.functions.invoke('stripe-web-hook', {
      body: { action: 'admin_charge_saved_card', chargeId: charge.id },
    });
    if (error || data?.error) {
      notify(data?.error || error.message);
      return false;
    }
    if (data?.status === 'succeeded' || data?.status === 'paid') {
      if (data.charge) setRentalCharges((current) => current.map((item) => item.id === charge.id ? { ...item, ...data.charge } : item));
      await loadAllData({ silent: true });
      notify('Saved card charged successfully. Stripe recorded the payment.', 'success');
      return true;
    }
    await loadAllData({ silent: true });
    notify(data?.reason || 'The saved card could not be charged. The customer payment link remains available.');
    return false;
  }

  async function updateVehicleStatus(id, status) {
    const allowedStatus = OPERATIONAL_VEHICLE_STATUS_OPTIONS.some(([key]) => key === status);
    if (!allowedStatus) {
      notify('Reserved and On the Road are controlled by the rental schedule, not the vehicle condition control.', 'error');
      return false;
    }
    const { error } = await supabase.from('vehicles').update({ status }).eq('id', id);
    if (error) {
      notify(error.message);
      return false;
    }
    setVehicles((current) => current.map((vehicle) =>
      vehicle.id === id ? { ...vehicle, status } : vehicle
    ));
    setRentals((current) => current.map((rental) =>
      rental.vehicle_id === id && rental.vehicles ? { ...rental, vehicles: { ...rental.vehicles, status } } : rental
    ));
    notify(`Vehicle condition set to ${operationalVehicleStatusLabel(status)}.`, 'success');
    return true;
  }

  async function updateVehiclePublished(id, published) {
    const vehicle = vehicles.find((item) => item.id === id);
    if (published && linesToList(vehicle?.features).length < 3) {
      return notify('Select at least three customer-facing features before publishing this vehicle.');
    }
    if (published && linesToList(vehicle?.image_urls).length < 1) {
      return notify('Add at least one vehicle picture before publishing this vehicle.');
    }
    const { error } = await supabase.from('vehicles').update({ published }).eq('id', id);
    if (error) return notify(error.message);
    setVehicles((current) => current.map((vehicle) =>
      vehicle.id === id ? { ...vehicle, published } : vehicle
    ));
    notify(published ? 'Vehicle published to customer-facing fleet views.' : 'Vehicle unpublished and hidden from customer-facing fleet views.', 'success');
  }

  async function markVehicleServiced(vehicle) {
    const currentMileage = parseMileageInput(vehicle?.current_mileage);
    if (currentMileage === null) return notify('Record the vehicle’s current mileage before completing maintenance.');
    const interval = Number(vehicle?.maintenance_interval_miles || DEFAULT_MAINTENANCE_INTERVAL);
    const { error } = await supabase
      .from('vehicles')
      .update({
        last_maintenance_mileage: currentMileage,
        next_maintenance_mileage: currentMileage + interval,
        maintenance_completed_at: new Date().toISOString(),
      })
      .eq('id', vehicle.id);
    if (error) return notify(error.message);
    setVehicles((current) => current.map((item) => item.id === vehicle.id ? {
      ...item,
      last_maintenance_mileage: currentMileage,
      next_maintenance_mileage: currentMileage + interval,
      maintenance_completed_at: new Date().toISOString(),
    } : item));
    notify(`Maintenance recorded. Next service is due at ${formatMiles(currentMileage + interval)}.`, 'success');
  }

  async function completeMaintenanceSchedule(schedule, completion) {
    const mileage = parseMileageInput(completion.mileage);
    if (mileage === null) return notify('Enter the vehicle mileage recorded when this service was completed.');
    if (!completion.completedAt) return notify('Enter the service completion date.');
    const { error } = await supabase.rpc('admin_complete_vehicle_service', {
      p_schedule_id: schedule.id,
      p_completed_mileage: mileage,
      p_completed_at: completion.completedAt,
      p_notes: completion.notes?.trim() || null,
    });
    if (error) return notify(error.message);
    await loadAllData({ silent: true });
    notify(`${schedule.label} recorded at ${formatMiles(mileage)}. The next milestone and calendar lock were recalculated.`, 'success');
    return true;
  }

  async function saveMaintenanceSchedule(schedule, updates) {
    const intervalMiles = parseOptionalPositiveInteger(updates.interval_miles);
    const intervalMonths = parseOptionalPositiveInteger(updates.interval_months);
    const lastServiceMileage = parseMileageInput(updates.last_service_mileage);
    if (intervalMiles === null && intervalMonths === null) return notify('Set a mileage interval, time interval, or both.');
    const { error } = await supabase.rpc('admin_save_vehicle_maintenance_schedule', {
      p_schedule_id: schedule.id || null,
      p_vehicle_id: schedule.vehicle_id,
      p_service_type: schedule.service_type,
      p_label: updates.label?.trim() || schedule.label,
      p_interval_miles: intervalMiles,
      p_interval_months: intervalMonths,
      p_warning_miles: parseOptionalPositiveInteger(updates.warning_miles) ?? 0,
      p_warning_days: parseOptionalPositiveInteger(updates.warning_days) ?? 0,
      p_last_service_mileage: lastServiceMileage,
      p_last_service_at: updates.last_service_at || null,
      p_lock_when_due: updates.lock_when_due !== false,
      p_active: updates.active !== false,
      p_notes: updates.notes?.trim() || null,
    });
    if (error) return notify(error.message);
    await loadAllData({ silent: true });
    notify(`${updates.label || schedule.label} schedule saved.`, 'success');
    return true;
  }

  async function overrideVehicleMaintenance(vehicle, reason, hours) {
    const duration = Number(hours);
    if (String(reason || '').trim().length < 10) return notify('Enter a specific maintenance override reason of at least 10 characters.');
    if (!Number.isInteger(duration) || duration < 1 || duration > 168) return notify('Choose an override between 1 and 168 hours.');
    const { error } = await supabase.rpc('admin_override_vehicle_maintenance', {
      p_vehicle_id: vehicle.id,
      p_reason: String(reason).trim(),
      p_hours: duration,
    });
    if (error) return notify(error.message);
    await loadAllData({ silent: true });
    notify(`${vehicle.name} temporarily returned to service. The override is audited and will expire automatically.`, 'success');
    return true;
  }

  async function updateDamageCase(id, updates) {
    const payload = { ...updates };
    if (payload.status === 'resolved') payload.resolved_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('vehicle_reports')
      .update(payload)
      .eq('id', id)
      .select('*, profiles(*), rentals(*, vehicles(*))')
      .single();
    if (error) return notify(error.message);
    setReports((current) => current.map((report) => report.id === id ? data : report));
    notify('Damage case updated.', 'success');
  }

  async function setCustomerStatus(userId, customerStatus, reason = '') {
    const { data, error } = await supabase.rpc('admin_set_customer_status', {
      p_user_id: userId,
      p_customer_status: customerStatus,
      p_block_reason: reason,
    });
    if (error) return notify(error.message);
    setProfiles((current) => current.map((profile) => profile.id === userId ? data : profile));
    setRentals((current) => current.map((rental) =>
      rental.user_id === userId ? { ...rental, profiles: { ...(rental.profiles || {}), ...data } } : rental
    ));
    setReports((current) => current.map((report) =>
      report.user_id === userId ? { ...report, profiles: { ...(report.profiles || {}), ...data } } : report
    ));
    notify(customerStatus === 'blocked' ? 'Customer blocked.' : customerStatus === 'good' ? 'Customer unblocked.' : 'Customer marked for review.', 'success');
  }

  async function updateCustomerProfile(userId, updates) {
    const { data, error } = await supabase.functions.invoke('admin-customers', {
      body: { action: 'update', customerId: userId, ...updates },
    });
    if (error || data?.error || !data?.profile) {
      throw new Error(data?.error || error?.message || 'Customer changes could not be saved.');
    }
    const updatedProfile = data.profile;
    setProfiles((current) => current.map((profile) => profile.id === userId ? updatedProfile : profile));
    setRentals((current) => current.map((rental) =>
      rental.user_id === userId ? { ...rental, profiles: { ...(rental.profiles || {}), ...updatedProfile } } : rental
    ));
    setReports((current) => current.map((report) =>
      report.user_id === userId ? { ...report, profiles: { ...(report.profiles || {}), ...updatedProfile } } : report
    ));
    notify('Customer details updated.', 'success');
    return updatedProfile;
  }

  async function deleteCustomerProfile(userId, confirmation) {
    const { data, error } = await supabase.functions.invoke('admin-customers', {
      body: { action: 'delete', customerId: userId, confirmation },
    });
    if (error || data?.error || !data?.deleted) {
      throw new Error(data?.error || error?.message || 'Customer could not be deleted.');
    }
    setProfiles((current) => current.filter((profile) => profile.id !== userId));
    notify('Customer deleted. Historical rental and payment records were retained.', 'success');
  }

  function startEditVehicle(vehicle) {
    setEditingVehicleId(vehicle.id);
    setEditVehicleForm({
      name: vehicle.name || '',
      brand: vehicle.brand || '',
      model: vehicle.model || '',
      vehicle_type: String(vehicle.vehicle_type || '').trim().toLowerCase(),
      plate_number: vehicle.plate_number || '',
      vin: vehicle.vin || '',
      daily_rate: vehicle.daily_rate || '',
      security_deposit: String(vehicle.security_deposit ?? DEFAULT_NEW_VEHICLE_DEPOSIT),
      original_mileage: vehicle.original_mileage ?? vehicle.current_mileage ?? '',
      current_mileage: vehicle.current_mileage ?? vehicle.original_mileage ?? '',
      maintenance_interval_miles: String(vehicle.maintenance_interval_miles || DEFAULT_MAINTENANCE_INTERVAL),
      last_maintenance_mileage: vehicle.last_maintenance_mileage ?? vehicle.original_mileage ?? '',
      description: vehicle.description || '',
      features: listToLines(vehicle.features),
      image_urls: listToLines(
        Array.isArray(vehicle.image_urls) && vehicle.image_urls.length
          ? vehicle.image_urls
          : [getAdminVehicleImage(vehicle)].filter(Boolean)
      ),
      published: vehicle.published !== false,
      status: SYSTEM_VEHICLE_STATUSES.includes(String(vehicle.status || '').toLowerCase()) ? '' : vehicle.status || 'available',
    });
  }

  function cancelEditVehicle() {
    setEditingVehicleId('');
    setEditVehicleForm(null);
  }

  async function saveVehicleEdit(id, { priceConfirmed = false, onError = null } = {}) {
    if (!editVehicleForm) return;
    const fail = (message) => {
      if (onError) onError(message);
      else notify(message);
      return false;
    };

    const vehicle = vehicles.find((item) => item.id === id);
    const vehicleName = String(editVehicleForm.name || '').trim();
    const vehicleType = String(editVehicleForm.vehicle_type || '').trim().toLowerCase();
    if (!vehicleName) return notify('Enter a vehicle name.');
    if (!vehicleType) return notify('Choose a vehicle type.');
    const previousDailyRate = Number(vehicle?.daily_rate || 0);
    const nextDailyRate = Number(editVehicleForm.daily_rate);
    if (!Number.isFinite(nextDailyRate) || nextDailyRate < 0 || nextDailyRate > MONEY_MAX) {
      return fail(`Enter a daily rate between $0 and ${money(MONEY_MAX)}.`);
    }
    const nextFeatures = linesToList(editVehicleForm.features);
    const nextImages = linesToList(editVehicleForm.image_urls);
    if (editVehicleForm.published && nextFeatures.length < 3) {
      return fail('Select at least three customer-facing features before publishing this vehicle.');
    }
    if (editVehicleForm.published && nextImages.length < 1) {
      return fail('Add at least one vehicle picture before publishing this vehicle.');
    }
    const priceConfirmation = getVehiclePriceConfirmation({
      action: 'edit',
      vehicleId: id,
      vehicleName: vehicle?.name || editVehicleForm.name || 'this vehicle',
      previousDailyRate,
      nextDailyRate,
      priceConfirmed,
    });
    if (priceConfirmation) {
      setVehiclePriceConfirmationError('');
      setVehiclePriceConfirmation(priceConfirmation);
      return false;
    }

    const originalMileageEntered = String(editVehicleForm.original_mileage ?? '').trim() !== '';
    const currentMileageEntered = String(editVehicleForm.current_mileage ?? '').trim() !== '';
    const originalMileage = parseMileageInput(editVehicleForm.original_mileage);
    const currentMileage = parseMileageInput(editVehicleForm.current_mileage);
    const lastServiceMileage = parseMileageInput(editVehicleForm.last_maintenance_mileage);
    if (originalMileageEntered !== currentMileageEntered) return fail('Enter both original and current mileage, or leave both blank for a legacy vehicle.');
    if (originalMileageEntered && (originalMileage === null || currentMileage === null)) return fail('Original and current mileage must be whole numbers.');
    if (originalMileage !== null && currentMileage !== null && currentMileage < originalMileage) return fail('Current mileage cannot be below the original mileage.');
    if (lastServiceMileage !== null && currentMileage === null) return fail('Enter current mileage before adding last service mileage.');
    if (lastServiceMileage !== null && currentMileage !== null && lastServiceMileage > currentMileage) return fail('Last service mileage cannot be above the current odometer.');

    const { status, ...vehicleFields } = editVehicleForm;
    if (status && !OPERATIONAL_VEHICLE_STATUS_OPTIONS.some(([key]) => key === status)) {
      return fail('Choose a vehicle condition. Reservation states are controlled by the rental schedule.');
    }
    const { error } = await supabase
      .from('vehicles')
      .update({
        ...vehicleFields,
        ...(status ? { status } : {}),
        name: vehicleName,
        vehicle_type: vehicleType,
        daily_rate: nextDailyRate,
        security_deposit: Number(editVehicleForm.security_deposit || 0),
        original_mileage: originalMileage,
        current_mileage: currentMileage,
        maintenance_interval_miles: Number(editVehicleForm.maintenance_interval_miles || DEFAULT_MAINTENANCE_INTERVAL),
        last_maintenance_mileage: lastServiceMileage,
        features: nextFeatures,
        image_urls: nextImages,
        image_url: nextImages[0] || null,
      })
      .eq('id', id);

    if (error) return fail(error.message);

    setEditingVehicleId('');
    setEditVehicleForm(null);
    loadAllData();
    notify(`${vehicle?.name || 'Vehicle'} updated.`, 'success');
    return true;
  }

  async function deleteVehicle(id) {
    const attachedRental = rentals.find((r) => r.vehicle_id === id);

    if (attachedRental) {
      return notify('This vehicle has rental history. Set it to unavailable instead of deleting it.');
    }

    const confirmed = window.confirm('Delete this vehicle permanently?');
    if (!confirmed) return;

    const { error } = await supabase.from('vehicles').delete().eq('id', id);
    if (error) return notify(error.message);

    loadAllData();
  }

  function generateDiscountCode() {
    const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
    const code = `RENTME-${randomPart}`;
    setDiscountForm((current) => ({ ...current, code }));
    navigator.clipboard?.writeText(code).then(
      () => notify('Discount code generated and copied.', 'success'),
      () => notify('Discount code generated. Use Copy after saving it.', 'success'),
    );
  }

  async function copyDiscountCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      notify(`${code} copied.`, 'success');
    } catch {
      notify('Copy was blocked by the browser. Select the code and copy it manually.');
    }
  }

  async function createDiscountCode(event) {
    event.preventDefault();
    const amount = Number(discountForm.amount);
    if (!discountForm.code.trim()) return notify('Enter or generate a discount code.');
    if (!amount || amount <= 0) return notify('Discount amount must be greater than zero.');
    if (discountForm.discount_type === 'percentage' && amount > 100) return notify('Percentage discounts cannot be over 100%.');

    const payload = {
      code: discountForm.code.trim().toUpperCase(),
      discount_type: discountForm.discount_type,
      amount,
      max_redemptions: discountForm.max_redemptions ? Number(discountForm.max_redemptions) : null,
      starts_at: discountForm.starts_at || null,
      expires_at: discountForm.expires_at || null,
      active: Boolean(discountForm.active),
      waive_security_deposit: Boolean(discountForm.waive_security_deposit),
    };

    const { data, error } = await supabase
      .from('discount_codes')
      .insert(payload)
      .select('*')
      .single();
    if (error) return notify(error.message);

    setDiscountCodes((current) => [data, ...current]);
    setPromotionForm((current) => ({
      ...current,
      coupon_code: data.code,
      discount_code_id: data.id,
    }));
    setDiscountForm({ code: '', discount_type: 'percentage', amount: '', max_redemptions: '', starts_at: '', expires_at: '', active: true, waive_security_deposit: false });
    notify('Discount code created and selected for the promotion manager.', 'success');
  }

  async function toggleDiscountCode(id, active) {
    const { data, error } = await supabase
      .from('discount_codes')
      .update({ active })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return notify(error.message);
    setDiscountCodes((current) => current.map((code) => code.id === id ? data : code));
    notify(active ? 'Discount code activated.' : 'Discount code paused.', 'success');
  }

  async function deleteDiscountCode(id) {
    const confirmed = window.confirm('Delete this discount code?');
    if (!confirmed) return;
    const { error } = await supabase.from('discount_codes').delete().eq('id', id);
    if (error) return notify(error.message);
    setDiscountCodes((current) => current.filter((code) => code.id !== id));
    notify('Discount code deleted.', 'success');
  }

  async function createServiceFee(event) {
    event.preventDefault();
    const amount = Number(serviceFeeForm.amount);
    if (!serviceFeeForm.name.trim()) return notify('Enter a service fee name.');
    if (!serviceFeeForm.service_type.trim()) return notify('Enter a fee type.');
    if (!amount || amount <= 0) return notify('Service fee amount must be greater than zero.');

    const payload = {
      name: serviceFeeForm.name.trim(),
      service_type: serviceFeeForm.service_type.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'custom_fee',
      amount,
      taxable: Boolean(serviceFeeForm.taxable),
      active: Boolean(serviceFeeForm.active),
      description: serviceFeeForm.description.trim() || null,
    };

    const { data, error } = await supabase
      .from('service_fees')
      .insert(payload)
      .select('*')
      .single();
    if (error) return notify(error.message);

    setServiceFees((current) => [data, ...current]);
    setServiceFeeForm({ name: '', service_type: '', amount: '0.00', taxable: true, active: true, description: '' });
    notify('Service fee added.', 'success');
  }

  async function toggleServiceFee(id, active) {
    const { data, error } = await supabase
      .from('service_fees')
      .update({ active })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return notify(error.message);
    setServiceFees((current) => current.map((fee) => fee.id === id ? data : fee));
    notify(active ? 'Service fee activated.' : 'Service fee paused.', 'success');
  }

  async function deleteServiceFee(id) {
    const confirmed = window.confirm('Delete this service fee?');
    if (!confirmed) return;
    const { error } = await supabase.from('service_fees').delete().eq('id', id);
    if (error) return notify(error.message);
    setServiceFees((current) => current.filter((fee) => fee.id !== id));
    notify('Service fee deleted.', 'success');
  }

  async function saveUnder25Pricing(event) {
    event?.preventDefault();
    const depositValue = Number(under25Pricing.deposit_adjustment_value || 0);
    const markup = Number(under25Pricing.rental_markup_percentage || 0);
    if (depositValue < 0 || (under25Pricing.deposit_adjustment_type === 'percentage' && depositValue > 100)) {
      return notify('Deposit adjustment must be between 0 and 100 percent, or a positive dollar amount.');
    }
    if (markup < 0 || markup > 100) return notify('Rental markup must be between 0 and 100 percent.');

    setUnder25PricingSaving(true);
    const payload = {
      deposit_adjustment_enabled: Boolean(under25Pricing.deposit_adjustment_enabled),
      deposit_adjustment_type: under25Pricing.deposit_adjustment_type === 'percentage' ? 'percentage' : 'fixed',
      deposit_adjustment_value: depositValue,
      rental_markup_percentage: markup,
      updated_at: new Date().toISOString(),
      updated_by: session?.user?.id || null,
    };
    const { data, error } = await supabase
      .from('under_25_pricing_settings')
      .update(payload)
      .eq('id', true)
      .select('*')
      .single();
    setUnder25PricingSaving(false);
    if (error) return notify(error.message);
    setUnder25Pricing(data);
    notify('Under-25 pricing updated.', 'success');
  }

  async function removeUnder25DepositAdjustment() {
    setUnder25PricingSaving(true);
    const { data, error } = await supabase
      .from('under_25_pricing_settings')
      .update({
        deposit_adjustment_enabled: false,
        deposit_adjustment_value: 0,
        updated_at: new Date().toISOString(),
        updated_by: session?.user?.id || null,
      })
      .eq('id', true)
      .select('*')
      .single();
    setUnder25PricingSaving(false);
    if (error) return notify(error.message);
    setUnder25Pricing(data);
    notify('Under-25 deposit adjustment removed. Vehicle deposits now apply without an age adjustment.', 'success');
  }

  async function saveBillingAutomation(event) {
    event?.preventDefault();
    const delayDays = Number(billingAutomation.deposit_release_delay_days || 0);
    if (!Number.isInteger(delayDays) || delayDays < 1 || delayDays > 30) {
      return notify('Automatic deposit release delay must be a whole number from 1 to 30 days.');
    }
    setBillingAutomationSaving(true);
    const payload = {
      automatic_deposit_release_enabled: Boolean(billingAutomation.automatic_deposit_release_enabled),
      deposit_release_delay_days: delayDays,
      tollspot_automatic_sync_enabled: Boolean(billingAutomation.tollspot_automatic_sync_enabled),
      tollspot_auto_create_charges: true,
      updated_at: new Date().toISOString(),
      updated_by: session?.user?.id || null,
    };
    const { data, error } = await supabase
      .from('billing_automation_settings')
      .update(payload)
      .eq('id', true)
      .select('*')
      .single();
    setBillingAutomationSaving(false);
    if (error) return notify(error.message);
    setBillingAutomation(data);
    notify('Billing automation settings saved.', 'success');
  }

  async function saveBookingPolicy(event) {
    event?.preventDefault();
    const minimumDays = Number(bookingPolicy.minimum_rental_days);
    const advanceMinutes = Number(bookingPolicy.advance_notice_minutes);
    const adminDeadlineMinutes = Number(bookingPolicy.admin_booking_payment_deadline_minutes);
    if (!Number.isInteger(minimumDays) || minimumDays < 1 || minimumDays > 30) {
      return notify('Minimum rental duration must be a whole number from 1 to 30 days.');
    }
    if (!Number.isInteger(advanceMinutes) || advanceMinutes < 0 || advanceMinutes > 525600) {
      return notify('Advance notice must be between immediate and 365 days.');
    }
    if (!Number.isInteger(adminDeadlineMinutes) || adminDeadlineMinutes < 5 || adminDeadlineMinutes > 10080) {
      return notify('Admin-created booking payment deadline must be between 5 minutes and 7 days.');
    }

    setBookingPolicySaving(true);
    const { data, error } = await supabase.rpc('set_admin_booking_policy', {
      p_minimum_rental_days: minimumDays,
      p_advance_notice_minutes: advanceMinutes,
      p_admin_booking_payment_deadline_minutes: adminDeadlineMinutes,
    });
    setBookingPolicySaving(false);
    if (error) return notify(error.message);
    setBookingPolicy({
      ...bookingPolicy,
      ...data,
      minimum_rental_hours: Number(data?.minimum_rental_days || minimumDays) * 24,
    });
    notify('Booking rules saved. New quotes and bookings now use these limits.', 'success');
  }

  function resetPromotionForm() {
    setEditingPromotionId('');
    setPromotionForm({ ...EMPTY_PROMOTION_FORM, popup_pages: ['index.html'], banner_pages: ['cars-2.html'] });
  }

  function editSitePromotion(promotion) {
    setEditingPromotionId(promotion.id);
    setPromotionForm({
      ...EMPTY_PROMOTION_FORM,
      ...promotion,
      starts_at: formatEasternDateTimeInput(promotion.starts_at),
      ends_at: formatEasternDateTimeInput(promotion.ends_at),
      popup_pages: [...(promotion.popup_pages || [])],
      banner_pages: [...(promotion.banner_pages || [])],
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveSitePromotion(event) {
    event.preventDefault();
    const couponCode = normalizeCodeInput(promotionForm.coupon_code);
    if (!promotionForm.name.trim()) return notify('Enter an internal campaign name.');
    if (couponCode.length < 2) return notify('Enter a coupon code.');
    const selectedDiscount = discountCodes.find((code) => code.code === couponCode);
    if (!selectedDiscount) return notify('Choose a saved discount code so the advertised offer changes the customer total.');
    if (!selectedDiscount.active) return notify('Activate this discount code before publishing the promotion.');
    if (!promotionForm.ends_at) return notify('Choose when the promotion ends.');
    if (!promotionForm.popup_enabled && !promotionForm.banner_enabled) return notify('Turn on the popup, the banner, or both.');
    if (promotionForm.popup_enabled && promotionForm.popup_pages.length === 0) return notify('Choose at least one page for the popup.');
    if (promotionForm.banner_enabled && promotionForm.banner_pages.length === 0) return notify('Choose at least one page for the banner.');

    const startsAt = promotionForm.starts_at ? easternDateTimeInputToIso(promotionForm.starts_at) : null;
    const endsAt = easternDateTimeInputToIso(promotionForm.ends_at);
    if (!endsAt) return notify('Enter a valid ending date and time.');
    if (startsAt && new Date(endsAt) <= new Date(startsAt)) return notify('The ending time must be after the starting time.');

    const payload = {
      name: promotionForm.name.trim(),
      coupon_code: couponCode,
      discount_code_id: selectedDiscount.id,
      badge_text: promotionForm.badge_text.trim() || 'SPECIAL OFFER',
      offer_value: promotionForm.offer_value.trim() || 'Offer',
      offer_suffix: promotionForm.offer_suffix.trim(),
      popup_kicker: promotionForm.popup_kicker.trim() || 'Limited-Time Special',
      popup_title: promotionForm.popup_title.trim() || promotionForm.name.trim(),
      popup_body: promotionForm.popup_body.trim() || 'Use the coupon code at checkout.',
      banner_title: promotionForm.banner_title.trim() || promotionForm.name.trim(),
      banner_body: promotionForm.banner_body.trim() || 'Use code',
      cta_label: promotionForm.cta_label.trim() || 'Choose Your Car',
      cta_url: promotionForm.cta_url.trim() || 'cars-2.html',
      fine_print: promotionForm.fine_print.trim() || null,
      starts_at: startsAt,
      ends_at: endsAt,
      popup_enabled: Boolean(promotionForm.popup_enabled),
      banner_enabled: Boolean(promotionForm.banner_enabled),
      popup_pages: promotionForm.popup_enabled ? promotionForm.popup_pages : [],
      banner_pages: promotionForm.banner_enabled ? promotionForm.banner_pages : [],
      active: Boolean(promotionForm.active),
    };

    if (payload.popup_enabled && (!promotionForm.popup_title.trim() || !promotionForm.popup_body.trim())) return notify('Enter the popup headline and message.');
    if (payload.banner_enabled && !promotionForm.banner_title.trim()) return notify('Enter the banner headline.');

    const query = editingPromotionId
      ? supabase.from('site_promotions').update(payload).eq('id', editingPromotionId).select('*').single()
      : supabase.from('site_promotions').insert(payload).select('*').single();
    const { data, error } = await query;
    if (error) return notify(sitePromotionTableError(error), 'error');

    setSitePromotions((current) => {
      const next = editingPromotionId
        ? current.map((promotion) => promotion.id === editingPromotionId ? data : promotion)
        : [data, ...current];
      return next.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    });
    notify(editingPromotionId ? 'Promotion updated on the website.' : 'Promotion created for the website.', 'success');
    resetPromotionForm();
  }

  async function toggleSitePromotion(id, active) {
    const { data, error } = await supabase
      .from('site_promotions')
      .update({ active })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return notify(sitePromotionTableError(error), 'error');
    setSitePromotions((current) => current.map((promotion) => promotion.id === id ? data : promotion));
    notify(active ? 'Promotion activated.' : 'Promotion paused and removed from the website.', 'success');
  }

  async function deleteSitePromotion(id) {
    const confirmed = window.confirm('Delete this promotion permanently?');
    if (!confirmed) return;
    const { error } = await supabase.from('site_promotions').delete().eq('id', id);
    if (error) return notify(sitePromotionTableError(error), 'error');
    setSitePromotions((current) => current.filter((promotion) => promotion.id !== id));
    if (editingPromotionId === id) resetPromotionForm();
    notify('Promotion deleted.', 'success');
  }

  async function saveAvailabilityBlock(event) {
    event.preventDefault();
    const vehicleId = availabilityBlockForm.vehicle_id || vehicles[0]?.id;
    if (!vehicleId) return notify('Choose a vehicle to block.');
    if (!availabilityBlockForm.start_date || !availabilityBlockForm.end_date) return notify('Choose start and end dates.');
    if (availabilityBlockForm.end_date < availabilityBlockForm.start_date) return notify('End date must be after the start date.');
    const selectedType = availabilityBlockForm.block_type || 'unavailable';
    if (!MANUAL_CALENDAR_ACTION_KEYS.includes(selectedType)) {
      return notify('Reserved, On the Road, and extension holds are created by the rental schedule and cannot be added manually.', 'error');
    }
    const editingBlock = editingAvailabilityBlockId
      ? availabilityBlocks.find((block) => block.id === editingAvailabilityBlockId)
      : null;
    if (editingBlock && !MANUAL_CALENDAR_BLOCK_TYPES.has(String(editingBlock.block_type || '').toLowerCase())) {
      return notify('This is a system-created calendar hold. Manage it from the related rental or extension request.', 'error');
    }

    if (selectedType === 'available') {
      const idsToClear = availabilityBlocks
        .filter((block) =>
          block.vehicle_id === vehicleId
          && MANUAL_CALENDAR_BLOCK_TYPES.has(String(block.block_type || '').toLowerCase())
          && datesOverlap(block.start_date, block.end_date, availabilityBlockForm.start_date, availabilityBlockForm.end_date)
        )
        .map((block) => block.id)
        .filter((id) => !String(id).startsWith('pending-'));

      if (idsToClear.length > 0) {
        const { error } = await supabase
          .from('vehicle_availability_blocks')
          .update({ active: false })
          .in('id', idsToClear);
        if (error) return notify(availabilityTableError(error), 'error');
        setAvailabilityBlocks((current) => current.filter((block) => !idsToClear.includes(block.id)));
      }

      setEditingAvailabilityBlockId('');
      setAvailabilityBlockForm({
        vehicle_id: vehicleId,
        start_date: '',
        end_date: '',
        start_time: '9:00 AM',
        end_time: '9:00 AM',
        block_type: 'unavailable',
        label: '',
        notes: '',
      });
      notify(idsToClear.length ? 'Selected dates are available again.' : 'Those dates were already available.', 'success');
      return;
    }

    const payload = {
      vehicle_id: vehicleId,
      start_date: availabilityBlockForm.start_date,
      end_date: availabilityBlockForm.end_date,
      start_time: availabilityBlockForm.start_time || '9:00 AM',
      end_time: availabilityBlockForm.end_time || '9:00 AM',
      block_type: selectedType,
      label: String(availabilityBlockForm.label ?? '').trim() || String(availabilityTypes[selectedType]?.label || prettyStatus(selectedType)),
      notes: String(availabilityBlockForm.notes ?? '').trim() || null,
      active: true,
    };

    const query = editingAvailabilityBlockId
      ? supabase
        .from('vehicle_availability_blocks')
        .update(payload)
        .eq('id', editingAvailabilityBlockId)
        .select('*, vehicles(*)')
        .single()
      : supabase
        .from('vehicle_availability_blocks')
        .insert(payload)
        .select('*, vehicles(*)')
        .single();

    const { data, error } = await query;
    if (error) return notify(availabilityTableError(error), 'error');

    setAvailabilityBlocks((current) => {
      const next = editingAvailabilityBlockId
        ? current.map((block) => block.id === editingAvailabilityBlockId ? data : block)
        : [...current, data];
      return next.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
    });
    setEditingAvailabilityBlockId('');
    setAvailabilityBlockForm({
      vehicle_id: vehicleId,
      start_date: '',
      end_date: '',
      start_time: '9:00 AM',
      end_time: '9:00 AM',
      block_type: 'unavailable',
      label: '',
      notes: '',
    });
    notify(editingAvailabilityBlockId ? 'Availability block updated.' : 'Availability block added.', 'success');
  }

  async function createAvailabilityBlock(event) {
    if (availabilitySaving) return;
    setAvailabilitySaving(true);
    try {
      await saveAvailabilityBlock(event);
    } catch (saveError) {
      notify(saveError instanceof Error ? saveError.message : 'The calendar block could not be saved.', 'error');
    } finally {
      setAvailabilitySaving(false);
    }
  }

  async function createAvailabilityPaintBlock({ vehicleId, startDate, endDate, blockType, startTime, endTime, label, notes }) {
    if (!vehicleId || !startDate || !endDate) return;
    const sortedDates = [startDate, endDate].sort();
    const type = blockType || 'unavailable';
    if (!MANUAL_CALENDAR_ACTION_KEYS.includes(type)) {
      return { ok: false, error: 'Reserved, On the Road, and extension holds are controlled by the rental schedule.' };
    }
    if (type === 'available') {
      const idsToClear = availabilityBlocks
        .filter((block) =>
          block.vehicle_id === vehicleId
          && MANUAL_CALENDAR_BLOCK_TYPES.has(String(block.block_type || '').toLowerCase())
          && datesOverlap(block.start_date, block.end_date, sortedDates[0], sortedDates[1])
        )
        .map((block) => block.id)
        .filter((id) => !String(id).startsWith('pending-'));
      if (idsToClear.length === 0) return { ok: true };
      const { error } = await supabase
        .from('vehicle_availability_blocks')
        .update({ active: false })
        .in('id', idsToClear);
      if (error) return { ok: false, error: availabilityTableError(error) };
      setAvailabilityBlocks((current) => current.filter((block) => !idsToClear.includes(block.id)));
      return { ok: true };
    }
    const payload = {
      vehicle_id: vehicleId,
      start_date: sortedDates[0],
      end_date: sortedDates[1],
      start_time: String(startTime || '12:00 AM'),
      end_time: String(endTime || '11:59 PM'),
      block_type: String(type),
      label: String(label || availabilityTypes[type]?.label || prettyStatus(type)),
      notes: String(notes || 'Painted from fleet calendar'),
      active: true,
    };
    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tempBlock = {
      ...payload,
      id: tempId,
      vehicles: vehicles.find((vehicle) => vehicle.id === vehicleId) || null,
    };

    setAvailabilityBlocks((current) => [...current, tempBlock].sort((a, b) => String(a.start_date).localeCompare(String(b.start_date))));

    const { data, error } = await supabase
      .from('vehicle_availability_blocks')
      .insert(payload)
      .select('*, vehicles(*)')
      .single();
    if (error) {
      setAvailabilityBlocks((current) => current.filter((block) => block.id !== tempId));
      return { ok: false, error: availabilityTableError(error) };
    }

    setAvailabilityBlocks((current) => current.map((block) => block.id === tempId ? data : block).sort((a, b) => String(a.start_date).localeCompare(String(b.start_date))));
    return { ok: true };
  }

  async function updateAvailabilityBlock(id, updates) {
    const currentBlock = availabilityBlocks.find((block) => block.id === id);
    if (!currentBlock || !MANUAL_CALENDAR_BLOCK_TYPES.has(String(currentBlock.block_type || '').toLowerCase())) {
      return { ok: false, error: 'System-created calendar holds must be managed from the related rental or extension request.' };
    }
    if (!MANUAL_CALENDAR_BLOCK_TYPES.has(String(updates.block_type || '').toLowerCase())) {
      return { ok: false, error: 'Choose Admin Hold, Unavailable, or Maintenance for a manual calendar block.' };
    }
    const payload = {
      vehicle_id: updates.vehicle_id,
      start_date: updates.start_date,
      end_date: updates.end_date,
      start_time: String(updates.start_time || '12:00 AM'),
      end_time: String(updates.end_time || '11:59 PM'),
      block_type: String(updates.block_type || 'unavailable'),
      label: String(updates.label || availabilityTypes[updates.block_type]?.label || prettyStatus(updates.block_type || 'unavailable')),
      notes: String(updates.notes ?? '').trim() || null,
      active: true,
    };

    const { data, error } = await supabase
      .from('vehicle_availability_blocks')
      .update(payload)
      .eq('id', id)
      .select('*, vehicles(*)')
      .single();
    if (error) return { ok: false, error: availabilityTableError(error) };
    setAvailabilityBlocks((current) => current.map((block) => block.id === id ? data : block).sort((a, b) => String(a.start_date).localeCompare(String(b.start_date))));
    return { ok: true };
  }

  function editAvailabilityBlock(block) {
    if (!MANUAL_CALENDAR_BLOCK_TYPES.has(String(block?.block_type || '').toLowerCase())) {
      notify('This is a system-created calendar hold. Manage it from the related rental or extension request.', 'info');
      return;
    }
    setEditingAvailabilityBlockId(block.id);
    setAvailabilityBlockForm({
      vehicle_id: block.vehicle_id || '',
      start_date: block.start_date || '',
      end_date: block.end_date || '',
      start_time: block.start_time || '9:00 AM',
      end_time: block.end_time || '9:00 AM',
      block_type: block.block_type || 'unavailable',
      label: block.label || '',
      notes: block.notes || '',
    });
    notify('Block loaded into the calendar form. Update the details and save.', 'info');
  }

  async function deleteAvailabilityBlock(id) {
    const block = availabilityBlocks.find((item) => item.id === id);
    if (!block || !MANUAL_CALENDAR_BLOCK_TYPES.has(String(block.block_type || '').toLowerCase())) {
      notify('System-created calendar holds cannot be removed here. Manage the related rental or extension request.', 'error');
      return false;
    }
    const confirmed = window.confirm('Remove this calendar block?');
    if (!confirmed) return false;
    const { error } = await supabase
      .from('vehicle_availability_blocks')
      .update({ active: false })
      .eq('id', id);
    if (error) {
      notify(availabilityTableError(error), 'error');
      return false;
    }
    setAvailabilityBlocks((current) => current.filter((block) => block.id !== id));
    notify('Availability block removed. Those dates are available again unless another rental or protected hold applies.', 'success');
    return true;
  }

  function updateAvailabilityType(key, field, value) {
    setAvailabilityTypes((current) => ({
      ...current,
      [key]: {
        ...(current[key] || DEFAULT_AVAILABILITY_TYPES[key] || { label: prettyStatus(key), color: '#394852' }),
        [field]: value,
      },
    }));
  }

  async function markDocument(id, status) {
    const { error } = await supabase.from('rental_documents').update({ status }).eq('id', id);
    if (error) return notify(error.message);
    const changedDocument = documents.find((document) => document.id === id);
    const updatedDocuments = documents.map((document) =>
      document.id === id ? { ...document, status } : document
    );
    setDocuments((current) => current.map((document) =>
      document.id === id ? { ...document, status } : document
    ));
    const movedRentals = status === 'approved' && changedDocument
      ? await autoMarkReadyForPickup(changedDocument, updatedDocuments)
      : [];
    const documentMessage = `${prettyStatus(status)} ${docLabel(documents.find((document) => document.id === id)?.document_type || 'document')}.`;
    const transitionMessage = movedRentals.length
      ? ` ${movedRentals.map((rental) => rentalDisplayName(rental)).join(', ')} moved to Ready For Pickup.`
      : '';
    notify(`${documentMessage}${transitionMessage}`, 'success');
  }

  async function autoMarkReadyForPickup(changedDocument, updatedDocuments) {
    const movedRentals = [];
    const candidateRentals = rentals.filter((rental) =>
      rental.user_id === changedDocument.user_id &&
      ['documents_needed', 'document_review', 'approved'].includes(rental.status)
    );

    for (const rental of candidateRentals) {
      const rentalDocuments = updatedDocuments.filter((document) => document.rental_id === rental.id);
      const reusableLicense = latestCustomerDocument(updatedDocuments, rental.user_id, 'license');
      const documentsForProgress = reusableLicense && !rentalDocuments.some((document) => document.id === reusableLicense.id)
        ? [reusableLicense, ...rentalDocuments]
        : rentalDocuments;
      const releaseChecklist = getReleaseChecklist(rental, documentsForProgress);
      if (!releaseChecklist.ready) continue;

      const { error } = await supabase
        .from('rentals')
        .update({ status: 'ready_for_pickup' })
        .eq('id', rental.id);
      if (error) {
        notify(error.message);
        continue;
      }

      const nextVehicleStatus = vehicleStatusForRentalStatus('ready_for_pickup');
      if (rental.vehicle_id && nextVehicleStatus) {
        await supabase.from('vehicles').update({ status: nextVehicleStatus }).eq('id', rental.vehicle_id);
      }

      setRentals((current) => current.map((item) =>
        item.id === rental.id
          ? {
              ...item,
              status: 'ready_for_pickup',
              vehicles: item.vehicles ? { ...item.vehicles, status: nextVehicleStatus } : item.vehicles,
            }
          : item
      ));
      if (rental.vehicle_id && nextVehicleStatus) {
        setVehicles((current) => current.map((vehicle) =>
          vehicle.id === rental.vehicle_id ? { ...vehicle, status: nextVehicleStatus } : vehicle
        ));
      }
      movedRentals.push(rental);
    }
    return movedRentals;
  }
  async function deleteDocument(document) {
  const confirmed = window.confirm(`Delete ${docLabel(document.document_type)} upload?`);
  if (!confirmed) return;

  const path = document.file_path || document.storage_path || document.path;

  if (path) {
    const { error: storageError } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .remove([path]);

    if (storageError) {
      notify(storageError.message);
      return;
    }
  }

  const { error } = await supabase
    .from('rental_documents')
    .delete()
    .eq('id', document.id);

  if (error) {
    notify(error.message);
    return;
  }

  setDocuments((current) => current.filter((item) => item.id !== document.id));
  notify('Document deleted.');
}

  async function openDocument(document) {
    const directUrl = document.file_url || document.document_url || document.public_url || document.url;
    const path = document.file_path || document.storage_path || document.path;

    recordAdminAuditEvent('document.opened', 'rental_document', document.id, {
      rental_id: document.rental_id || null,
      document_type: document.document_type || null,
    });

    if (directUrl) {
      window.open(directUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    if (!path) {
      notify('No document file path found for this upload.');
      return;
    }

    const { data, error } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .createSignedUrl(path, 60 * 5);

    if (error) return notify(error.message);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function sendReply(event) {
    event.preventDefault();
    if (!replyText.trim() || !selectedRental) return;

    const { error } = await supabase.from('rental_messages').insert({
      user_id: selectedRental.user_id,
      rental_id: selectedRental.id,
      sender_role: 'admin',
      message: replyText.trim(),
      read_by_admin: true,
      read_by_client: false,
    });
    if (error) return notify(error.message);

    setReplyText('');
    loadAllData();
  }

  async function selectCommunicationThread(rental) {
    if (!rental?.id) return;
    setSelectedRentalId(rental.id);
    const unreadIds = messages
      .filter((message) => message.user_id === rental.user_id && message.sender_role !== 'admin' && !message.read_by_admin)
      .map((message) => message.id);
    if (!unreadIds.length) return;
    setMessages((current) => current.map((message) => unreadIds.includes(message.id) ? { ...message, read_by_admin: true } : message));
    const { error } = await supabase.from('rental_messages').update({ read_by_admin: true }).in('id', unreadIds);
    if (error) notify(error.message);
  }

  async function createManualBooking(event) {
    event.preventDefault();
    const vehicle = vehicles.find((item) => item.id === manualBookingForm.vehicleId);
    if (manualBookingForm.customerMode === 'existing' && !manualBookingForm.customerId) return notify('Choose a customer.');
    const selectedExistingCustomer = profiles.find((profile) => profile.id === manualBookingForm.customerId);
    if (manualBookingForm.customerMode === 'existing' && !selectedExistingCustomer?.full_name?.trim()
      && (!manualBookingForm.existingFirstName.trim() || !manualBookingForm.existingLastName.trim())) {
      return notify('Enter the existing customer’s first and last name so it can be saved to their profile.');
    }
    if (manualBookingForm.customerMode === 'new' && (!manualBookingForm.firstName.trim() || !manualBookingForm.lastName.trim() || !manualBookingForm.email.trim() || !manualBookingForm.phone.trim() || !manualBookingForm.dateOfBirth)) {
      return notify('Enter the new customer’s first name, last name, email, phone, and date of birth.');
    }
    if (manualBookingForm.customerMode === 'new' && !isEligibleAdminBirthday(manualBookingForm.dateOfBirth)) {
      return notify('Enter a real birthday for a renter who is at least 21 years old.');
    }
    if (manualBookingForm.customerMode === 'existing' && !isEligibleAdminBirthday(
      profiles.find((profile) => profile.id === manualBookingForm.customerId)?.date_of_birth || manualBookingForm.existingDateOfBirth
    )) {
      return notify('Enter a real birthday for a renter who is at least 21 years old.');
    }
    const deliveryNeedsText = ['text', 'both'].includes(manualBookingForm.onboardingDelivery);
    const deliveryPhone = manualBookingForm.customerMode === 'new' ? manualBookingForm.phone : manualBookingForm.existingPhone;
    if (deliveryNeedsText && !isValidUSPhone(deliveryPhone)) {
      return notify('Enter a valid 10-digit US mobile number before sending the secure link by text.');
    }
    if (!vehicle) return notify('Choose a vehicle.');

    const bookingWindow = getBookingWindow(manualBookingForm, bookingPolicy);
    if (!bookingWindow.valid) return notify(bookingWindow.error);

    const { data: policyQuote, error: policyQuoteError } = await supabase.rpc('get_booking_quote', {
      p_vehicle_id: vehicle.id,
      p_pickup_date: manualBookingForm.pickupDate,
      p_pickup_time: manualBookingForm.pickupTime,
      p_return_date: manualBookingForm.returnDate,
      p_return_time: manualBookingForm.returnTime,
    });
    if (policyQuoteError) return notify(policyQuoteError.message);
    if (!policyQuote?.valid) return notify(policyQuote?.error || 'These pickup and return times are not allowed.');

    const available = await isVehicleAvailable(vehicle.id, manualBookingForm.pickupDate, manualBookingForm.pickupTime, manualBookingForm.returnDate, manualBookingForm.returnTime);
    if (!available) return notify('Vehicle is not available for that pickup and return time.');

    setManualBookingSubmitting(true);
    const { data, error } = await supabase.functions.invoke('admin-manual-booking', {
      body: {
        customerMode: manualBookingForm.customerMode,
        customerId: manualBookingForm.customerId || undefined,
        customerFullName: manualBookingForm.customerMode === 'existing' && !selectedExistingCustomer?.full_name?.trim()
          ? joinLegalName(manualBookingForm.existingFirstName, manualBookingForm.existingLastName)
          : undefined,
        customerDateOfBirth: manualBookingForm.existingDateOfBirth || undefined,
        customerPhone: manualBookingForm.customerMode === 'existing' ? manualBookingForm.existingPhone.trim() : undefined,
        driverInfo: {
          licenseNumber: manualBookingForm.driverLicenseNumber.trim(),
          licenseState: manualBookingForm.driverLicenseState.trim(),
          insuranceProvider: manualBookingForm.insuranceProvider.trim(),
          insurancePolicyNumber: manualBookingForm.insurancePolicyNumber.trim(),
        },
        customer: manualBookingForm.customerMode === 'new' ? {
          fullName: joinLegalName(manualBookingForm.firstName, manualBookingForm.lastName),
          email: manualBookingForm.email.trim(),
          phone: manualBookingForm.phone.trim(),
          dateOfBirth: manualBookingForm.dateOfBirth,
          address: manualBookingForm.address.trim(),
        } : undefined,
        vehicleId: manualBookingForm.vehicleId,
        pickupDate: manualBookingForm.pickupDate,
        returnDate: manualBookingForm.returnDate,
        pickupTime: manualBookingForm.pickupTime,
        returnTime: manualBookingForm.returnTime,
        onboardingDelivery: manualBookingForm.onboardingDelivery,
        paymentCollectionPreference: manualBookingForm.paymentCollectionPreference,
      },
    });
    setManualBookingSubmitting(false);

    if (error || data?.error) {
      let detail = data?.error || error?.message || 'Could not create the booking.';
      try {
        const payload = await error?.context?.clone?.().json();
        detail = payload?.error || detail;
      } catch {
        // Keep the function error message.
      }
      return notify(detail);
    }

    setManualBookingForm({ customerMode: 'existing', customerId: '', existingFirstName: '', existingLastName: '', existingDateOfBirth: '', existingPhone: '', firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', address: '', driverLicenseNumber: '', driverLicenseState: '', insuranceProvider: '', insurancePolicyNumber: '', vehicleId: '', pickupDate: adminBookingDateOffset(0), returnDate: adminBookingDateOffset(Number(bookingPolicy.minimum_rental_days || 1)), pickupTime: '9:00 AM', returnTime: '9:00 AM', onboardingDelivery: 'both', paymentCollectionPreference: 'customer_link' });
    await loadAllData({ silent: true });
    setManualBookingFocusId(data?.rental?.id || '');
    setSelectedRentalId(data?.rental?.id || '');
    setRentalFilter('needs_action');
    setActiveTab('rentals');
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
    const deliveredBy = (data?.deliveryChannels || []).map((channel) => channel === 'text' ? 'text' : 'email').join(' and ');
    notify(`${data?.customerCreated ? 'Customer saved and booking created' : 'Booking created'}${data?.onboardingSent ? ` — secure completion link sent by ${deliveredBy}.` : ' — finish it from the workflow circles in Rental Manager.'}`, 'success');
    if (data?.onboardingWarning) notify(`Booking was saved, but one delivery method needs attention: ${data.onboardingWarning}`);
    const textDelivery = (data?.deliveryDetails || []).find((item) => item.channel === 'text');
    if (textDelivery && textDelivery.status !== 'delivered') {
      notify(`Booking saved. Twilio status: ${prettySmsDeliveryStatus(textDelivery)}. Carrier delivery is not confirmed; use Email Only or Copy secure checklist link if the customer needs it now.`);
    }
  }

  async function sendBookingCompletionLink(rental, delivery = 'email') {
    const { data, error } = await supabase.functions.invoke('admin-manual-booking', {
      body: { action: 'create_onboarding_link', rentalId: rental.id, delivery },
    });
    if (error || data?.error) {
      notify(data?.error || error?.message || 'Could not create the secure customer link.');
      return null;
    }
    if (delivery === 'copy') {
      try {
        await navigator.clipboard.writeText(data.onboardingUrl);
        notify('Secure customer completion link copied. Treat it like a password and send it only to the customer.', 'success');
      } catch {
        window.prompt('Copy this secure customer completion link:', data.onboardingUrl);
      }
    } else {
      const channels = (data.deliveryChannels || [delivery]).map((channel) => channel === 'text' ? 'text' : 'email').join(' and ');
      const textDelivery = (data?.deliveryDetails || []).find((item) => item.channel === 'text');
      if (textDelivery?.status === 'delivered') {
        notify(`Secure customer completion link delivered by text${channels.includes('email') ? ' and accepted by email' : ''}.`, 'success');
      } else if (textDelivery) {
        notify(`Twilio accepted the text, but carrier delivery is not confirmed. Current status: ${prettySmsDeliveryStatus(textDelivery)}. Use Email Only or Copy secure checklist link if the customer needs it now.`);
      } else {
        notify(`Secure customer completion link sent by ${channels}.`, 'success');
      }
      if (data.onboardingWarning) notify(`One delivery method needs attention: ${data.onboardingWarning}`);
    }
    return data.onboardingUrl;
  }

  async function uploadAdminBookingDocument(rental, documentType, file) {
    if (!rental?.id || !rental?.user_id || !file) return false;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `${rental.user_id}/${documentType}/admin-${rental.id}-${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, file, { upsert: false });
    if (uploadError) return notify(uploadError.message);
    const { data, error } = await supabase.from('rental_documents').insert({
      user_id: rental.user_id,
      rental_id: rental.id,
      document_type: documentType,
      file_path: path,
      status: 'pending_review',
    }).select('*, profiles!rental_documents_user_id_profiles_fkey(*), rentals(*, vehicles(*))').single();
    if (error) {
      await supabase.storage.from(DOCUMENT_BUCKET).remove([path]);
      return notify(error.message);
    }
    setDocuments((current) => [data, ...current]);
    notify(`${docLabel(documentType)} uploaded for review. Approve it only after checking the image and expiration details.`, 'success');
    return true;
  }

  async function completeAdminRentalStep(rental, stepKey, note, metadata = {}) {
    const { data, error } = await supabase.rpc('admin_complete_rental_step', {
      p_rental_id: rental.id,
      p_step_key: stepKey,
      p_note: note,
      p_metadata: metadata,
    });
    if (error) {
      notify(error.message);
      return false;
    }
    const nextRental = data?.rental;
    const completion = data?.completion;
    if (nextRental) {
      setRentals((current) => current.map((item) => item.id === rental.id
        ? { ...item, ...nextRental, profiles: item.profiles, vehicles: item.vehicles }
        : item));
    }
    if (completion) {
      setRentalStepCompletions((current) => [completion, ...current.filter((item) => !(item.rental_id === rental.id && item.step_key === stepKey))]);
    }
    await loadAllData({ silent: true, domains: ['core', 'workflow', 'payments'] });
    notify(`${prettyStatus(stepKey)} marked complete and added to activity history.`, 'success');
    return true;
  }

  async function signAdminRentalAgreement(rental, signature) {
    const snapshot = buildAdminAgreementSnapshot(rental, signature.name, signature.image);
    const hashBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(snapshot));
    const agreementHash = [...new Uint8Array(hashBytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const { data, error } = await supabase.rpc('admin_sign_rental_agreement_in_office', {
      p_rental_id: rental.id,
      p_signature_name: signature.name,
      p_agreement_version: AGREEMENT_VERSION,
      p_agreement_snapshot: snapshot,
      p_agreement_hash: agreementHash,
      p_signature_data: signature.image,
      p_note: signature.note,
    });
    if (error) {
      notify(error.message);
      return false;
    }
    const nextRental = data?.rental;
    const completion = data?.completion;
    if (nextRental) setRentals((current) => current.map((item) => item.id === rental.id ? { ...item, ...nextRental, profiles: item.profiles, vehicles: item.vehicles } : item));
    if (completion) setRentalStepCompletions((current) => [completion, ...current.filter((item) => !(item.rental_id === rental.id && item.step_key === 'agreement'))]);
    await loadAllData({ silent: true, domains: ['core', 'workflow'] });
    notify('Signed rental agreement saved to the booking and activity history.', 'success');
    return true;
  }

  async function createAdminPaymentLink(rental, mode = 'copy') {
    const successUrl = `${CLIENT_PORTAL_URL}/?booking=${encodeURIComponent(rental.id)}&payment=stripe_success`;
    const cancelUrl = `${CLIENT_PORTAL_URL}/?booking=${encodeURIComponent(rental.id)}&payment=stripe_cancelled`;
    const { data, error } = await supabase.functions.invoke('stripe-web-hook', {
      body: { action: 'admin_create_checkout', rentalId: rental.id, successUrl, cancelUrl },
    });
    if (!error && data?.noPaymentRequired) {
      notify('The 100% discount completed this booking with the security deposit waived. No Stripe payment link was needed.', 'success');
      loadAllData({ silent: true });
      return 'completed-with-discount';
    }
    if (error || data?.error || !data?.url) {
      notify(data?.error || error?.message || 'The secure Stripe payment session could not be created.');
      return null;
    }
    if (mode === 'open') window.open(data.url, '_blank', 'noopener,noreferrer');
    else {
      try {
        await navigator.clipboard.writeText(data.url);
        notify('Secure Stripe payment link copied.', 'success');
      } catch {
        window.prompt('Copy this secure Stripe payment link:', data.url);
      }
    }
    return data.url;
  }

  async function addVehicle(event, { priceConfirmed = false, onError = null } = {}) {
    event?.preventDefault();
    const fail = (message) => {
      if (onError) onError(message);
      else notify(message);
      return false;
    };
    const vehicleName = String(vehicleForm.name || '').trim();
    const vehicleType = String(vehicleForm.vehicle_type || '').trim().toLowerCase();
    if (!vehicleName) {
      return fail('Enter a vehicle name.');
    }
    if (!VEHICLE_TYPE_OPTIONS.some(([value]) => value === vehicleType)) {
      return fail('Choose a valid vehicle type.');
    }
    if (!OPERATIONAL_VEHICLE_STATUS_OPTIONS.some(([key]) => key === vehicleForm.status)) {
      return fail('Choose a valid vehicle condition.');
    }
    const dailyRate = Number(vehicleForm.daily_rate);
    if (!Number.isFinite(dailyRate) || dailyRate < 0 || dailyRate > MONEY_MAX) {
      return fail(`Enter a daily rate between $0 and ${money(MONEY_MAX)}.`);
    }
    const nextFeatures = linesToList(vehicleForm.features);
    const nextImages = linesToList(vehicleForm.image_urls);
    if (vehicleForm.published && nextFeatures.length < 3) {
      return fail('Select at least three customer-facing features before publishing this vehicle.');
    }
    if (vehicleForm.published && nextImages.length < 1) {
      return fail('Add at least one vehicle picture before publishing this vehicle.');
    }
    const priceConfirmation = getVehiclePriceConfirmation({
      action: 'add',
      vehicleName: vehicleForm.name || 'this new vehicle',
      nextDailyRate: dailyRate,
      priceConfirmed,
    });
    if (priceConfirmation) {
      setVehiclePriceConfirmationError('');
      setVehiclePriceConfirmation(priceConfirmation);
      return false;
    }
    const originalMileage = parseMileageInput(vehicleForm.original_mileage);
    const currentMileage = parseMileageInput(vehicleForm.current_mileage);
    if (originalMileage === null || currentMileage === null) {
      return fail('Original and current mileage are required.');
    }
    if (currentMileage < originalMileage) {
      return fail('Current mileage cannot be below the original mileage.');
    }
    const lastServiceMileage = parseMileageInput(vehicleForm.last_maintenance_mileage);
    if (lastServiceMileage !== null && lastServiceMileage > currentMileage) {
      return fail('Last service mileage cannot be above the current odometer.');
    }
    const { error } = await supabase.from('vehicles').insert({
      ...vehicleForm,
      name: vehicleName,
      vehicle_type: vehicleType,
      daily_rate: dailyRate,
      security_deposit: Number(vehicleForm.security_deposit || 0),
      original_mileage: originalMileage,
      current_mileage: currentMileage,
      maintenance_interval_miles: Number(vehicleForm.maintenance_interval_miles || DEFAULT_MAINTENANCE_INTERVAL),
      last_maintenance_mileage: lastServiceMileage ?? currentMileage,
      features: nextFeatures,
      image_urls: nextImages,
      image_url: nextImages[0] || null,
    });
    if (error) {
      return fail(error.message);
    }
    const wasPublished = vehicleForm.published;
    setVehicleForm(createEmptyVehicleForm());
    await loadAllData();
    notify(wasPublished ? 'Vehicle added and published.' : 'Vehicle added as an unpublished draft.', 'success');
    return true;
  }

  async function confirmVehiclePriceChange() {
    const pending = vehiclePriceConfirmation;
    if (!pending || vehiclePriceConfirming) return;
    setVehiclePriceConfirmationError('');
    setVehiclePriceConfirming(true);
    try {
      const onError = (message) => setVehiclePriceConfirmationError(message);
      const saved = pending.action === 'edit'
        ? await saveVehicleEdit(pending.vehicleId, { priceConfirmed: true, onError })
        : await addVehicle(null, { priceConfirmed: true, onError });
      if (saved) setVehiclePriceConfirmation(null);
    } finally {
      setVehiclePriceConfirming(false);
    }
  }

  async function sendManualReminder(rental, channel) {
    const customer = rental.profiles?.full_name || rental.profiles?.phone || rental.user_id;
    if (channel !== 'SMS') {
      notify(`${channel} reminder placeholder for ${customer}. SendGrid delivery is still pending.`);
      return;
    }

    if (!rental.profiles?.phone) {
      notify(`No phone number found for ${customer}.`);
      return;
    }

    const { data, error } = await supabase.functions.invoke('send-rental-due-reminders', {
      body: { rentalId: rental.id },
    });

    if (error) {
      let detail = error.message || 'Could not send SMS reminder.';
      try {
        const payload = await error.context?.clone?.().json();
        detail = payload?.error || detail;
      } catch {
        try {
          detail = await error.context?.clone?.().text() || detail;
        } catch {
          // Keep the original Supabase error message.
        }
      }
      console.error('Manual SMS reminder failed', { rentalId: rental.id, error, data, detail });
      return notify(detail);
    }
    if (data?.error) return notify(data.error);
    notify(`Return reminder SMS sent to ${customer}.`, 'success');
  }

  const adminTabs = [
    { key: 'dashboard', label: 'Dashboard', icon: Gauge },
    { key: 'queue', label: 'Queue', icon: ClipboardList },
    { key: 'payments', label: 'Payments', icon: DollarSign },
    { key: 'tolls', label: 'Tolls', icon: ReceiptText },
    { key: 'calendar', label: 'Calendar', icon: CalendarDays },
    { key: 'rentals', label: 'Rentals', icon: KeyRound },
    { key: 'vehicles', label: 'Vehicles', icon: Car },
    { key: 'customers', label: 'Customers', icon: UserRound },
    { key: 'emails', label: 'Communications', icon: MessageCircle },
    { key: 'audit', label: 'Audit Log', icon: History },
    { key: 'settings', label: 'Settings', icon: Settings },
  ];

  function selectAdminTab(key) {
    setActiveTab(key);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
    if (isMobileAdminNav) {
      setNavCollapsed(true);
    }
  }

  function prefetchAdminTab(key) {
    (ADMIN_TAB_DOMAINS[key] || ['core']).forEach((domain) => {
      void loadAdminDomain(domain);
    });
  }

  function retryAdminSection(label) {
    const domainByLabel = {
      'Dashboard snapshot': 'snapshot',
      'Customer directory': 'customer-directory',
      Customers: 'customer-directory', Vehicles: 'core', Rentals: 'core', 'Booking holds': 'core',
      'Emergency exceptions': 'core', 'Maintenance schedules': 'core',
      Documents: 'workflow', Messages: 'workflow', Reports: 'workflow', Extensions: 'workflow',
      Deposits: 'payments', Payments: 'payments', Refunds: 'payments', 'Additional charges': 'payments',
      'Stripe reconciliation': 'payments',
      'Email templates': 'templates', 'Text templates': 'templates',
      'Calendar blocks': 'calendar',
      Discounts: 'settings', Fees: 'settings', Promotions: 'settings', 'Under-25 pricing': 'settings',
      'Billing automation': 'settings', 'Booking page': 'settings', 'Booking rules': 'settings',
      'Audit log': 'audit', 'Maintenance history': 'maintenance-history',
    };
    return loadAdminDomain(domainByLabel[label] || 'core', { force: true });
  }

  function toggleMobileNav() {
    setNavCollapsed((current) => !current);
  }

  if (loading || (session && adminRoleChecking)) return <Loading message={session ? 'Verifying admin access…' : 'Loading admin portal…'} />;
  if (!session) return <Login authForm={authForm} setAuthForm={setAuthForm} handleLogin={handleLogin} authMessage={authMessage} showPassword={showAdminPassword} setShowPassword={setShowAdminPassword} handleForgotPassword={handleAdminForgotPassword} />;
  if (!isAdminUser) return <NotAdmin email={session.user.email} signOut={signOut} />;

  return (
    <div className={`admin-shell ${navCollapsed ? 'nav-collapsed' : ''}`}>
      {isMobileAdminNav && !navCollapsed && <button type="button" className="mobile-drawer-scrim" aria-label="Close admin navigation" onClick={() => setNavCollapsed(true)} />}
      {isMobileAdminNav && (
        <aside className={`mobile-drawer admin-mobile-drawer ${navCollapsed ? '' : 'open'}`} aria-label="Admin navigation">
          <div className="mobile-drawer-brand">
            <img src={logoUrl} alt="Rent Me CT" />
          </div>
          <button className="mobile-drawer-close admin-close-button" type="button" onClick={() => setNavCollapsed(true)} aria-label="Close admin navigation">
            <X size={22} />
          </button>
          <nav className="mobile-drawer-nav" id="admin-mobile-drawer-navigation">
            <button type="button" className={activeTab === 'new-booking' ? 'active' : ''} onClick={() => selectAdminTab('new-booking')} aria-current={activeTab === 'new-booking' ? 'page' : undefined}>
              <CalendarClock size={20}/><span>New Booking</span>
            </button>
            {adminTabs.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" className={activeTab === key ? 'active' : ''} onMouseEnter={() => prefetchAdminTab(key)} onFocus={() => prefetchAdminTab(key)} onClick={() => selectAdminTab(key)} aria-current={activeTab === key ? 'page' : undefined}>
                <Icon size={20}/><span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="mobile-drawer-footer">
            <button type="button" onClick={signOut}><LogOut size={19}/><span>Log Out</span></button>
          </div>
        </aside>
      )}
      {!isMobileAdminNav && (
        <aside className={`sidebar ${navCollapsed ? 'collapsed' : ''}`} aria-label="Admin navigation">
          <div className="brand-block">
            <img className="brand-logo" src={logoUrl} alt="Rent Me CT" />
          </div>
          <button className="nav-toggle" type="button" onClick={toggleMobileNav} aria-expanded={!navCollapsed} aria-controls="admin-primary-navigation" aria-label={navCollapsed ? 'Expand admin navigation' : 'Collapse admin navigation'}>
            {navCollapsed ? <Menu size={18} /> : <X size={18} />}<span>{navCollapsed ? 'Expand' : 'Collapse'}</span>
          </button>
          <nav className="side-nav" id="admin-primary-navigation">
            {adminTabs.map(({ key, label, icon: Icon }) => (
              <button key={key} className={activeTab === key ? 'active' : ''} onMouseEnter={() => prefetchAdminTab(key)} onFocus={() => prefetchAdminTab(key)} onClick={() => selectAdminTab(key)} title={label} aria-current={activeTab === key ? 'page' : undefined}>
                <Icon size={18}/><span>{label}</span>
              </button>
            ))}
          </nav>
          <button className="logout-btn" onClick={signOut} title="Log Out"><LogOut size={18}/><span>Log Out</span></button>
        </aside>
      )}

      <main className="admin-main">
        {notice && <div className="notice-viewport"><Notice notice={notice} onDismiss={() => {
          if (notice.type === 'update') updateNoticeShownRef.current = false;
          setNotice(null);
        }} /></div>}
        <header className="admin-header">
          {isMobileAdminNav && navCollapsed && (
            <button
              type="button"
              className="mobile-drawer-trigger"
              aria-label="Open admin navigation"
              aria-controls="admin-mobile-drawer-navigation"
              aria-expanded="false"
              onClick={() => setNavCollapsed(false)}
            >
              <Menu size={22} />
            </button>
          )}
          <div className="admin-header-copy"><p className="eyebrow">Operations Center</p><h1>{tabTitle(activeTab)}</h1><span>{session.user.email}</span></div>
          <div className="header-actions">
            <button type="button" className="primary-btn" onClick={() => selectAdminTab('new-booking')}><CalendarClock size={17}/> New Booking</button>
            {isMobileAdminNav ? <MobileAdminQuickLinks/> : <AdminQuickLinks/>}
            <button type="button" onClick={() => loadAllData({ silent: true })} className="secondary-btn" disabled={dataHealth.refreshing}>{dataHealth.refreshing ? 'Refreshing…' : 'Refresh'}</button>
          </div>
        </header>

        <PortalDataHealth
          health={dataHealth}
          onRetry={retryAdminSection}
          audience="admin"
        />

        {activeTab === 'dashboard' && <Dashboard snapshot={dashboardSnapshot} dashboard={dashboard} vehicles={vehicles} rentals={rentals} maintenanceSchedules={maintenanceSchedules} emergencyExceptions={emergencyExceptions} sendManualReminder={sendManualReminder} />}
        {activeTab === 'queue' && <OperationsQueue queue={operationsQueue} updateRentalStatus={updateRentalStatus} recordTestPayment={recordTestPayment} openDocument={openDocument} markDocument={markDocument} decideExtension={decideExtension} recordExtensionPayment={recordExtensionPayment} />}
        {activeTab === 'payments' && <PaymentsTab paymentEvents={paymentEvents} paymentFilter={paymentFilter} setPaymentFilter={setPaymentFilter} paymentTypeFilter={paymentTypeFilter} setPaymentTypeFilter={setPaymentTypeFilter} rentals={rentals} loadError={paymentLoadError} onOpenRental={(rentalId) => { setManualBookingFocusId(rentalId); selectAdminTab('rentals'); }} />}
        {activeTab === 'tolls' && <TollsTab rentals={rentals} notify={notify} />}
        {activeTab === 'calendar' && <FleetCalendar vehicles={vehicles} rentals={rentals} availabilityBlocks={availabilityBlocks} availabilityBlockForm={availabilityBlockForm} setAvailabilityBlockForm={setAvailabilityBlockForm} editingAvailabilityBlockId={editingAvailabilityBlockId} availabilitySaving={availabilitySaving} availabilityTypes={availabilityTypes} createAvailabilityBlock={createAvailabilityBlock} createAvailabilityPaintBlock={createAvailabilityPaintBlock} updateAvailabilityBlock={updateAvailabilityBlock} editAvailabilityBlock={editAvailabilityBlock} deleteAvailabilityBlock={deleteAvailabilityBlock} />}
        {activeTab === 'new-booking' && <ManualBooking manualBookingForm={manualBookingForm} setManualBookingForm={setManualBookingForm} profiles={profiles} customerDirectoryState={customerDirectoryState} refreshCustomerDirectory={() => loadAdminDomain('customer-directory', { force: true })} vehicles={vehicles} rentals={rentals} pendingBookings={pendingBookings} availabilityBlocks={availabilityBlocks} under25Pricing={under25Pricing} serviceFees={serviceFees.filter((fee) => fee.active)} bookingPolicy={bookingPolicy} createManualBooking={createManualBooking} submitting={manualBookingSubmitting} />}
        {activeTab === 'rentals' && <Rentals rentals={manualBookingFocusId ? rentals.filter((rental) => rental.id === manualBookingFocusId) : filteredRentals} allRentals={rentalManagerRentals} focusRentalId={manualBookingFocusId} clearRentalFocus={() => setManualBookingFocusId('')} search={search} setSearch={setSearch} rentalFilter={rentalFilter} setRentalFilter={setRentalFilter} updateRentalStatus={updateRentalStatus} updateRentalPaymentDeadline={updateRentalPaymentDeadline} completeRentalReturn={completeRentalReturn} releaseSecurityDeposit={releaseSecurityDeposit} refundRentalPayment={refundRentalPayment} rentalRefunds={rentalRefunds} recordLocalDepositRelease={recordLocalDepositRelease} depositAllocations={depositAllocations} recordTestPayment={recordTestPayment} recordExtensionPayment={recordExtensionPayment} cancelApprovedExtension={cancelApprovedExtension} extensionRequests={extensionRequests} emergencyExceptions={emergencyExceptions} emergencyAuthorized={Boolean(profiles.find((profile) => profile.id === session?.user?.id)?.emergency_override_authorized)} activateRentalWithEmergencyException={activateRentalWithEmergencyException} addEmergencyExceptionScope={addEmergencyExceptionScope} resolveEmergencyExceptionScope={resolveEmergencyExceptionScope} vehicles={vehicles} reports={reports} decideExtension={decideExtension} sendManualReminder={sendManualReminder} openDocument={openDocument} markDocument={markDocument} deleteDocument={deleteDocument} documents={documents} documentsByRentalId={documentsByRentalId} rentalCharges={rentalCharges} addRentalCharge={addRentalCharge} waiveRentalCharge={waiveRentalCharge} chargeRentalSavedCard={chargeRentalSavedCard} previewRentalAmendment={previewRentalAmendment} applyRentalAmendment={applyRentalAmendment} emailTemplates={customerEmailTemplates} smsTemplates={smsTemplates} notify={notify} sendBookingCompletionLink={sendBookingCompletionLink} uploadAdminBookingDocument={uploadAdminBookingDocument} createAdminPaymentLink={createAdminPaymentLink} rentalStepCompletions={rentalStepCompletions} completeAdminRentalStep={completeAdminRentalStep} signAdminRentalAgreement={signAdminRentalAgreement} />}
        {activeTab === 'customers' && <Customers profiles={profiles} customerDirectoryState={customerDirectoryState} refreshCustomerDirectory={() => loadAdminDomain('customer-directory', { force: true })} rentals={rentals} documentsByUserId={documentsByUserId} documents={documents} reports={reports} openDocument={openDocument} emailTemplates={customerEmailTemplates} smsTemplates={smsTemplates} notify={notify} updateCustomerProfile={updateCustomerProfile} deleteCustomerProfile={deleteCustomerProfile} />}
        {activeTab === 'emails' && <ContactCenterTab profiles={profiles} rentals={rentals} messages={messages} selectedRental={selectedRental} onSelectThread={selectCommunicationThread} replyText={replyText} setReplyText={setReplyText} sendReply={sendReply} adminEmail={session.user.email} notify={notify} onTemplatesChanged={() => loadAllData({ silent: true })} />}
        {activeTab === 'vehicles' && <Vehicles vehicles={vehicles} maintenanceSchedules={maintenanceSchedules} maintenanceServiceLogs={maintenanceServiceLogs} vehicleForm={vehicleForm} setVehicleForm={setVehicleForm} addVehicle={addVehicle} updateVehicleStatus={updateVehicleStatus} updateVehiclePublished={updateVehiclePublished} completeMaintenanceSchedule={completeMaintenanceSchedule} saveMaintenanceSchedule={saveMaintenanceSchedule} overrideVehicleMaintenance={overrideVehicleMaintenance} editingVehicleId={editingVehicleId} editVehicleForm={editVehicleForm} setEditVehicleForm={setEditVehicleForm} startEditVehicle={startEditVehicle} cancelEditVehicle={cancelEditVehicle} saveVehicleEdit={saveVehicleEdit} deleteVehicle={deleteVehicle} notify={notify} />}
        {activeTab === 'damage' && <DamageCases reports={reports} updateDamageCase={updateDamageCase} setCustomerStatus={setCustomerStatus} />}
        {activeTab === 'documents' && <Documents documents={documents} markDocument={markDocument} openDocument={openDocument} deleteDocument={deleteDocument} />}
        {activeTab === 'audit' && <AuditLog auditLogs={auditLogs} />}
        {activeTab === 'settings' && <SettingsTab discountCodes={discountCodes} discountForm={discountForm} setDiscountForm={setDiscountForm} generateDiscountCode={generateDiscountCode} copyDiscountCode={copyDiscountCode} createDiscountCode={createDiscountCode} toggleDiscountCode={toggleDiscountCode} deleteDiscountCode={deleteDiscountCode} sitePromotions={sitePromotions} promotionForm={promotionForm} setPromotionForm={setPromotionForm} editingPromotionId={editingPromotionId} saveSitePromotion={saveSitePromotion} editSitePromotion={editSitePromotion} resetPromotionForm={resetPromotionForm} toggleSitePromotion={toggleSitePromotion} deleteSitePromotion={deleteSitePromotion} serviceFees={serviceFees} serviceFeeForm={serviceFeeForm} setServiceFeeForm={setServiceFeeForm} createServiceFee={createServiceFee} toggleServiceFee={toggleServiceFee} deleteServiceFee={deleteServiceFee} under25Pricing={under25Pricing} setUnder25Pricing={setUnder25Pricing} saveUnder25Pricing={saveUnder25Pricing} removeUnder25DepositAdjustment={removeUnder25DepositAdjustment} under25PricingSaving={under25PricingSaving} billingAutomation={billingAutomation} setBillingAutomation={setBillingAutomation} saveBillingAutomation={saveBillingAutomation} billingAutomationSaving={billingAutomationSaving} bookingPolicy={bookingPolicy} setBookingPolicy={setBookingPolicy} saveBookingPolicy={saveBookingPolicy} bookingPolicySaving={bookingPolicySaving} availabilityTypes={availabilityTypes} updateAvailabilityType={updateAvailabilityType} />}
      </main>
      {vehiclePriceConfirmation && createPortal(<VehiclePriceConfirmationModal
        confirmation={vehiclePriceConfirmation}
        error={vehiclePriceConfirmationError}
        confirming={vehiclePriceConfirming}
        onCancel={() => {
          if (vehiclePriceConfirming) return;
          setVehiclePriceConfirmation(null);
          setVehiclePriceConfirmationError('');
        }}
        onConfirm={confirmVehiclePriceChange}
      />, document.body)}
    </div>
  );
}

function Dashboard({ snapshot, dashboard, vehicles, rentals = [], maintenanceSchedules = [], emergencyExceptions = [], sendManualReminder }) {
  const maintenanceDue = vehicles.filter((vehicle) => {
    const schedules = maintenanceSchedules.filter((schedule) => schedule.vehicle_id === vehicle.id);
    return vehicle.maintenance_lock_active || schedules.some((schedule) => getMaintenanceScheduleState(schedule, vehicle).due);
  }).length;
  const openEmergencyExceptions = (snapshot?.emergency_exceptions || emergencyExceptions).filter((item) => {
    const rental = rentals.find((candidate) => candidate.id === item.rental_id) || item.rentals;
    const rentalStatus = String(rental?.status || '').toLowerCase();
    return item.status === 'active' && !['completed', 'cancelled'].includes(rentalStatus);
  });
  const returnRows = snapshot
    ? [...(snapshot.overdue_rentals || []), ...(snapshot.due_soon_rentals || [])]
    : [...dashboard.overdue, ...dashboard.dueSoon];
  return <>
    <section className="metric-grid">
      <Metric icon={Car} label="Cars Out" value={snapshot?.cars_out ?? dashboard.active.length} />
      <Metric icon={AlertTriangle} label="Overdue" value={snapshot?.overdue_count ?? dashboard.overdue.length} danger={(snapshot?.overdue_count ?? dashboard.overdue.length) > 0} />
      <Metric icon={Wrench} label="Maintenance Due" value={snapshot?.maintenance_due ?? maintenanceDue} danger={(snapshot?.maintenance_due ?? maintenanceDue) > 0} />
      <Metric icon={Banknote} label="Month Revenue" value={money(snapshot?.month_revenue ?? dashboard.monthRevenue)} />
      <Metric icon={CreditCard} label="Active Deposits" value={money(snapshot?.active_deposits ?? dashboard.deposits)} />
    </section>
    {openEmergencyExceptions.length > 0 && <section className="dashboard-emergency-exceptions">
      <div><AlertTriangle size={21}/><strong>{openEmergencyExceptions.length} emergency exception{openEmergencyExceptions.length === 1 ? '' : 's'} require follow-up</strong></div>
      {openEmergencyExceptions.slice(0, 5).map((item) => {
        const rental = rentals.find((candidate) => candidate.id === item.rental_id);
        const expired = new Date(item.expires_at).getTime() <= Date.now();
        return <span className={expired ? 'expired' : ''} key={item.id}>{expired ? 'EXPIRED — ' : ''}{rental?.profiles?.full_name || item.rentals?.profiles?.full_name || 'Customer'} • {(item.exception_scopes || []).map(prettyStatus).join(', ')} • due {new Date(item.expires_at).toLocaleString()}</span>;
      })}
    </section>}
    <Panel title="Due Soon / Overdue" eyebrow="Return Monitor">
      {returnRows.length === 0 && <p className="muted">No due-soon rentals right now.</p>}
      {returnRows.slice(0, 6).map((r) => <ReturnMonitorRow key={r.id} rental={r} sendManualReminder={sendManualReminder} />)}
    </Panel>
  </>;
}

function OperationsQueue({ queue, updateRentalStatus, recordTestPayment, openDocument, markDocument, decideExtension, recordExtensionPayment }) {
  const buckets = [
    ['needs_approval', 'Needs Approval'],
    ['payment_needed', 'Payment Needed'],
    ['pickup_today', 'Pickup Today'],
    ['return_attention', 'Return Attention'],
  ];
  return <Panel title="Operational View" eyebrow="Operations Queue">
    {queue.length === 0 && <p className="muted">Nothing needs attention right now.</p>}
    <div className="operations-buckets">
      {buckets.map(([bucket, label]) => {
        const items = queue.filter((item) => item.bucket === bucket);
        const visibleItems = items.slice(0, 5);
        return <section className="operations-bucket" key={bucket}>
        <h4>{label} <span>{items.length}</span></h4>
        <div className="table-list">
          {items.length === 0 && <p className="muted">Clear.</p>}
          {visibleItems.map((item) => <div className={`data-row queue-row ${item.severity}`} key={item.id}>
        <div>
          <strong>{item.title}</strong>
          <span>{item.subtitle}</span>
          <small>{item.detail}</small>
        </div>
        <div className="row-actions">
          <em>{item.severity}</em>
          {item.rental && item.localPaymentAction && <small>Complete verification and document review in Rental Manager before recording payment.</small>}
          {item.rental && item.nextStatus && <button className="approve" onClick={() => updateRentalStatus(item.rental.id, item.nextStatus)}><CheckCircle2 size={16}/> {prettyStatus(item.nextStatus)}</button>}
          {item.extensionInsurance && <button onClick={() => openDocument(item.extensionInsurance)}><FileText size={16}/> Open Insurance</button>}
          {item.extensionInsurance && item.extensionInsurance.status !== 'approved' && <button className="approve" onClick={() => markDocument(item.extensionInsurance.id, 'approved')}><CheckCircle2 size={16}/> Approve Insurance</button>}
          {item.extension && item.extension.status === 'pending' && <button className="approve" disabled={item.extensionInsurance?.status !== 'approved'} title={item.extensionInsurance?.status !== 'approved' ? 'Approve the new extension insurance first.' : undefined} onClick={() => decideExtension(item.extension.id, true)}><CheckCircle2 size={16}/> Approve &amp; Notify Customer</button>}
          {item.extension && item.extension.status === 'pending' && <button className="reject" onClick={() => decideExtension(item.extension.id, false)}><XCircle size={16}/> Decline</button>}
          {item.extension && item.extension.status === 'approved_pending_payment' && <button className="approve" onClick={() => recordExtensionPayment(item.extension.id)}><CreditCard size={16}/> Record Payment</button>}
          {item.document && <button onClick={() => openDocument(item.document)}><FileText size={16}/> Open</button>}
          {item.document && <button className="approve" onClick={() => markDocument(item.document.id, 'approved')}><CheckCircle2 size={16}/> Approve</button>}
          {item.document && <button className="reject" onClick={() => markDocument(item.document.id, 'rejected')}><XCircle size={16}/> Reject</button>}
        </div>
      </div>)}
          {items.length > visibleItems.length && <p className="muted">Showing 5 of {items.length}. Use Rentals, Payments, or Messages for the full list.</p>}
        </div>
      </section>;
      })}
    </div>
  </Panel>;
}

function PaymentsTab({ paymentEvents, paymentFilter, setPaymentFilter, paymentTypeFilter, setPaymentTypeFilter, rentals, loadError = '', onOpenRental }) {
  const collected = paymentEvents.reduce((sum, event) => sum + Math.max(0, Number(event.cashImpact || 0)), 0);
  const refunded = paymentEvents.reduce((sum, event) => sum + Math.abs(Math.min(0, Number(event.cashImpact || 0))), 0);
  const outstanding = paymentEvents.reduce((sum, event) => sum + Math.max(0, Number(event.outstandingAmount || 0)), 0);
  const depositsHeld = rentals.filter((rental) => ['held', 'adjustment_refund_due', 'release_pending'].includes(String(rental.deposit_status || '').toLowerCase()));
  const visibleEvents = paymentEvents.filter((event) => paymentEventMatchesFilter(event, paymentFilter, paymentTypeFilter));
  const openReconciliation = paymentEvents.filter((event) => event.type === 'reconciliation' && ['pending', 'failed'].includes(event.statusGroup));

  return <>
    <section className="metric-grid payments-metrics">
      <Metric icon={DollarSign} label="Gross Collected" value={money(collected)} />
      <Metric icon={ReceiptText} label="Refunded" value={money(refunded)} />
      <Metric icon={Clock} label="Outstanding" value={money(outstanding)} danger={outstanding > 0} />
      <Metric icon={ReceiptText} label="Deposits Held" value={money(depositsHeld.reduce((sum, rental) => sum + Number(rental.deposit_held_amount || 0), 0))} />
    </section>
    {openReconciliation.length > 0 && (
      <p className="form-error" role="alert">
        Urgent: {openReconciliation.length} Stripe {openReconciliation.length === 1 ? 'transaction requires' : 'transactions require'} reconciliation. No captured payment or refund in this list should be treated as fully coordinated until its status is resolved.
      </p>
    )}
    <Panel title="Payments" eyebrow="Payment Activity">
      {loadError && <p className="form-error" role="alert">Some payment sources could not be loaded: {loadError}</p>}
      <div className="payments-filter-bar">
        <div className="filter-pills" role="group" aria-label="Payment activity views">
          {[
            ['all', 'All Activity'],
            ['attention', 'Needs Attention'],
            ['received', 'Money Received'],
            ['refunds', 'Refunds'],
          ].map(([key, label]) => (
            <button key={key} type="button" className={paymentFilter === key ? 'active' : ''} aria-pressed={paymentFilter === key} onClick={() => setPaymentFilter(key)}>{label}</button>
          ))}
        </div>
        <label className="payments-type-filter">
          <span>Type</span>
          <select value={paymentTypeFilter} onChange={(event) => setPaymentTypeFilter(event.target.value)}>
            <option value="all">All types</option>
            <option value="rental">Rentals</option>
            <option value="deposit">Deposits</option>
            <option value="extension">Extensions and switches</option>
            <option value="charge">Additional charges</option>
            <option value="refund">Refunds</option>
            <option value="reconciliation">Reconciliation issues</option>
          </select>
        </label>
      </div>
      <div className="payments-table" role="table" aria-label="Payment activity">
        <div className="payments-table-head" role="row">
          <span role="columnheader">Customer</span>
          <span role="columnheader">Vehicle</span>
          <span role="columnheader">Type</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">Amount</span>
          <span role="columnheader">Date</span>
        </div>
        {visibleEvents.length === 0 && <p className="muted">No payment activity matches this filter.</p>}
        {visibleEvents.map((event) => (
          <div className="payments-table-row" role="row" key={event.id}>
            <span role="cell" data-label="Customer"><strong>{event.customer}</strong><small>{event.detail}</small></span>
            <span role="cell" data-label="Vehicle">{event.vehicle}</span>
            <span role="cell" data-label="Type">{event.typeLabel || prettyStatus(event.type)}</span>
            <span role="cell" data-label="Status"><em className={event.statusGroup === 'paid' ? 'active-status' : 'paused-status'}>{prettyStatus(event.displayStatus || event.statusGroup)}</em></span>
            <span role="cell" data-label="Amount">{money(event.amount)}</span>
            <span role="cell" data-label="Date" className="payment-date-cell">
              {event.date ? new Date(event.date).toLocaleDateString() : '—'}
              {event.rentalId && <button type="button" className="payment-open-rental" onClick={() => onOpenRental?.(event.rentalId)}>Open rental</button>}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  </>;
}

function TollsTab({ rentals = [], notify }) {
  const [transactions, setTransactions] = useState([]);
  const [syncRuns, setSyncRuns] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [loadError, setLoadError] = useState('');
  const [connection, setConnection] = useState(null);
  const [statusFilter, setStatusFilter] = useState('open');
  const [matchSelections, setMatchSelections] = useState({});
  const [dateWindow, setDateWindow] = useState({
    fromDate: adminBookingDateOffset(-30),
    toDate: adminBookingDateOffset(0),
  });
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [vehicleConfig, setVehicleConfig] = useState({
    tollspot_enabled: true,
    tollspot_vehicle_type: '',
    plate_state: 'CT',
    plate_country: 'US',
    plate_assigned_at: '',
    model_year: '',
  });

  async function loadTollspotData({ silent = false } = {}) {
    if (!silent) setLoading(true);
    const [transactionsRes, runsRes, mappingsRes, fleetRes] = await Promise.all([
      withRequestDeadline(supabase
        .from('admin_tollspot_transactions')
        .select('*')
        .order('occurred_at', { ascending: false })
        .limit(500), 'Toll transactions'),
      withRequestDeadline(supabase
        .from('tollspot_sync_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(30), 'Toll sync history'),
      withRequestDeadline(supabase
        .from('tollspot_vehicle_mappings')
        .select('*')
        .order('updated_at', { ascending: false }), 'Toll vehicle mappings'),
      withRequestDeadline(supabase
        .from('vehicles')
        .select('id,name,brand,model,plate_number,vin,status,published,tollspot_enabled,tollspot_vehicle_type,plate_state,plate_country,plate_assigned_at,model_year')
        .neq('id', '00000000-0000-4000-8000-000000000015')
        .order('name'), 'Toll fleet'),
    ]);
    const errors = [transactionsRes.error, runsRes.error, mappingsRes.error, fleetRes.error].filter(Boolean);
    setLoadError(errors.map((error) => error.message).join(' '));
    if (transactionsRes.data) setTransactions(transactionsRes.data);
    if (runsRes.data) setSyncRuns(runsRes.data);
    if (mappingsRes.data) setMappings(mappingsRes.data);
    if (fleetRes.data) {
      setFleet(fleetRes.data);
      if (!selectedVehicleId && fleetRes.data[0]) setSelectedVehicleId(fleetRes.data[0].id);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadTollspotData();
  }, []);

  useEffect(() => {
    const vehicle = fleet.find((item) => item.id === selectedVehicleId);
    if (!vehicle) return;
    setVehicleConfig({
      tollspot_enabled: true,
      tollspot_vehicle_type: vehicle.tollspot_vehicle_type || '',
      plate_state: vehicle.plate_state || 'CT',
      plate_country: vehicle.plate_country || 'US',
      plate_assigned_at: formatEasternDateTimeInput(vehicle.plate_assigned_at),
      model_year: vehicle.model_year || '',
    });
  }, [selectedVehicleId, fleet]);

  async function parseFunctionError(error, fallback) {
    let message = error?.message || fallback;
    try {
      const payload = await error?.context?.clone?.().json();
      message = payload?.error || message;
    } catch {
      // Keep the Supabase Functions error.
    }
    return message;
  }

  async function invokeTollspot(action, extra = {}) {
    if (busy) return null;
    setBusy(action);
    const { data, error } = await supabase.functions.invoke('tollspot-sync', {
      body: { action, ...extra },
    });
    setBusy('');
    if (error || data?.error) {
      const message = data?.error || await parseFunctionError(error, 'TollSpot action failed.');
      setConnection(action === 'health' ? { connected: false, error: message } : connection);
      notify(message);
      await loadTollspotData({ silent: true });
      return null;
    }
    if (action === 'health') setConnection(data);
    notify(
      action === 'health'
        ? `Connected to TollSpot API ${data.apiVersion}.`
        : action === 'sync_fleet'
          ? `${data.synced || 0} TollSpot fleet records synchronized.`
          : `${data.received || data.tolls?.received || 0} TollSpot charges checked.`,
      'success'
    );
    await loadTollspotData({ silent: true });
    return data;
  }

  async function saveVehicleConfig(event) {
    event.preventDefault();
    const vehicle = fleet.find((item) => item.id === selectedVehicleId);
    if (!vehicle) return;
    if (!vehicleConfig.tollspot_vehicle_type) return notify('Choose a TollSpot vehicle type.');
    if (!/^[A-Z]{2,3}$/.test(vehicleConfig.plate_state)) return notify('Enter a 2–3 letter plate state.');
    if (!/^[A-Z]{2,3}$/.test(vehicleConfig.plate_country)) return notify('Enter a 2–3 letter plate country.');
    if (!vehicleConfig.plate_assigned_at) return notify('Enter when this plate became active on the vehicle.');
    setBusy('save_vehicle');
    const { error } = await supabase.from('vehicles').update({
      tollspot_enabled: true,
      tollspot_vehicle_type: vehicleConfig.tollspot_vehicle_type || null,
      plate_state: vehicleConfig.plate_state || null,
      plate_country: vehicleConfig.plate_country || 'US',
      plate_assigned_at: vehicleConfig.plate_assigned_at
        ? easternDateTimeInputToIso(vehicleConfig.plate_assigned_at)
        : null,
      model_year: vehicleConfig.model_year ? Number(vehicleConfig.model_year) : null,
    }).eq('id', vehicle.id);
    setBusy('');
    if (error) return notify(error.message);
    notify(`${vehicle.name} TollSpot settings saved.`, 'success');
    await loadTollspotData({ silent: true });
  }

  async function matchTransaction(transaction) {
    const rentalId = matchSelections[transaction.id];
    if (!rentalId) return notify('Choose the rental that was using this vehicle.');
    setBusy(`match:${transaction.id}`);
    const { error } = await supabase.rpc('admin_match_tollspot_transaction', {
      p_transaction_id: transaction.id,
      p_rental_id: rentalId,
    });
    setBusy('');
    if (error) return notify(error.message);
    notify('TollSpot charge matched to the rental.', 'success');
    await loadTollspotData({ silent: true });
  }

  async function createTollCharge(transaction) {
    const confirmed = window.confirm(
      `Create a pending ${money(transaction.total_amount)} customer charge for TollSpot transaction ${transaction.tollspot_transaction_id}? This does not charge the saved card.`
    );
    if (!confirmed) return;
    setBusy(`charge:${transaction.id}`);
    const { error } = await supabase.rpc('admin_create_tollspot_charge', {
      p_transaction_id: transaction.id,
      p_taxable: false,
    });
    setBusy('');
    if (error) return notify(error.message);
    notify('Pending toll charge created. The customer can pay through the secure portal.', 'success');
    await loadTollspotData({ silent: true });
  }

  async function ignoreTransaction(transaction) {
    const reason = window.prompt('Why should this TollSpot transaction be ignored? Enter at least 8 characters.');
    if (!reason) return;
    setBusy(`ignore:${transaction.id}`);
    const { error } = await supabase.rpc('admin_ignore_tollspot_transaction', {
      p_transaction_id: transaction.id,
      p_reason: reason,
    });
    setBusy('');
    if (error) return notify(error.message);
    notify('TollSpot transaction ignored with an audit reason.', 'success');
    await loadTollspotData({ silent: true });
  }

  const selectedVehicle = fleet.find((item) => item.id === selectedVehicleId);
  const openStatuses = new Set(['received', 'needs_review', 'matched']);
  const visibleTransactions = transactions.filter((item) =>
    statusFilter === 'all'
      ? true
      : statusFilter === 'open'
        ? openStatuses.has(item.status)
        : item.status === statusFilter
  );
  const mappingByVehicle = new Map(mappings.map((mapping) => [mapping.vehicle_id, mapping]));
  const latestRun = syncRuns[0];

  if (loading) return <Loading message="Loading TollSpot operations…" />;

  return <section className="tollspot-command-center">
    {loadError && <div className="data-health-banner error"><AlertTriangle size={18}/><div><strong>TollSpot data could not load</strong><span>{loadError}</span></div></div>}

    <div className="tollspot-summary-grid">
      <Panel title="API Connection" eyebrow="TollSpot Customer API">
        <div className="tollspot-connection-state">
          <span className={`fleet-status-badge ${connection?.connected ? 'available' : connection?.error ? 'unavailable' : 'reserved'}`}>
            {connection?.connected ? 'Connected' : connection?.error ? 'Needs configuration' : 'Not tested'}
          </span>
          <p>{connection?.connected
            ? `${connection.visibleVehicles} provider vehicles visible • API ${connection.apiVersion}`
            : connection?.error || 'Test the server-only connection. The API key is never sent to this browser.'}</p>
          <button className="primary-btn" disabled={Boolean(busy)} onClick={() => invokeTollspot('health')}>
            {busy === 'health' ? 'Testing…' : 'Test Connection'}
          </button>
        </div>
      </Panel>
      <Panel title="Synchronization" eyebrow="Automatic With Manual Retry">
        <div className="tollspot-sync-controls">
          <div className="tollspot-date-window">
            <label>From<input type="date" value={dateWindow.fromDate} onChange={(event) => setDateWindow({ ...dateWindow, fromDate: event.target.value })}/></label>
            <label>To<input type="date" value={dateWindow.toDate} onChange={(event) => setDateWindow({ ...dateWindow, toDate: event.target.value })}/></label>
          </div>
          <div className="row-actions">
            <button className="secondary-btn" disabled={Boolean(busy)} onClick={() => invokeTollspot('sync_fleet')}>{busy === 'sync_fleet' ? 'Syncing…' : 'Retry Fleet Sync'}</button>
            <button className="primary-btn" disabled={Boolean(busy)} onClick={() => invokeTollspot('sync_tolls', dateWindow)}>{busy === 'sync_tolls' ? 'Fetching…' : 'Fetch Now'}</button>
          </div>
          <small>{latestRun ? `Last run: ${prettyStatus(latestRun.status)} • ${new Date(latestRun.started_at).toLocaleString()}` : 'No TollSpot sync has run yet.'}</small>
        </div>
      </Panel>
    </div>

    <Panel title="Fleet Enrollment" eyebrow="Vehicles & Plate Assignments">
      <div className="tollspot-fleet-layout">
        <div className="tollspot-fleet-list">
          {fleet.map((vehicle) => {
            const mapping = mappingByVehicle.get(vehicle.id);
            return <button type="button" key={vehicle.id} className={selectedVehicleId === vehicle.id ? 'selected' : ''} onClick={() => setSelectedVehicleId(vehicle.id)}>
              <span><strong>{vehicle.name}</strong><small>{vehicle.plate_number || 'No plate'} • {vehicle.vin ? `VIN …${vehicle.vin.slice(-5)}` : 'No VIN'}</small></span>
              <em>{mapping?.sync_status ? prettyStatus(mapping.sync_status) : vehicle.tollspot_enabled ? 'Pending' : 'Disabled'}</em>
            </button>;
          })}
        </div>
        {selectedVehicle && <form className="portal-form tollspot-vehicle-config" onSubmit={saveVehicleConfig}>
          <div className="vehicle-form-card-heading"><strong>{selectedVehicle.name}</strong><span>Provider-only enrollment settings</span></div>
          <div className="automation-lock-note"><CheckCircle2 size={17}/><span><strong>TollSpot enabled</strong><small>Every real fleet vehicle is enrolled automatically.</small></span></div>
          <label>Provider vehicle type<select value={vehicleConfig.tollspot_vehicle_type} onChange={(event) => setVehicleConfig({ ...vehicleConfig, tollspot_vehicle_type: event.target.value })}><option value="">Choose type</option>{['SEDAN','SUV','TRUCK','MOTORCYCLE','RV','TRAILER'].map((value) => <option key={value} value={value}>{prettyStatus(value)}</option>)}</select></label>
          <label>Model year<input type="number" min="1900" max="2200" value={vehicleConfig.model_year} onChange={(event) => setVehicleConfig({ ...vehicleConfig, model_year: event.target.value })}/></label>
          <div className="tollspot-code-fields">
            <label>Plate state<input maxLength="3" value={vehicleConfig.plate_state} onChange={(event) => setVehicleConfig({ ...vehicleConfig, plate_state: event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) })}/></label>
            <label>Plate country<input maxLength="3" value={vehicleConfig.plate_country} onChange={(event) => setVehicleConfig({ ...vehicleConfig, plate_country: event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) })}/></label>
          </div>
          <label>Plate active since<input type="datetime-local" value={vehicleConfig.plate_assigned_at} onChange={(event) => setVehicleConfig({ ...vehicleConfig, plate_assigned_at: event.target.value })}/></label>
          <button className="primary-btn" disabled={busy === 'save_vehicle'}>{busy === 'save_vehicle' ? 'Saving…' : 'Save Enrollment'}</button>
        </form>}
      </div>
    </Panel>

    <Panel title="Toll Exceptions" eyebrow="Automatic Matches Need No Admin Work">
      <div className="filter-row tollspot-filter-row">
        {['open', 'matched', 'charge_created', 'paid', 'ignored', 'all'].map((status) => <button type="button" key={status} className={statusFilter === status ? 'active' : ''} onClick={() => setStatusFilter(status)}>{prettyStatus(status)}</button>)}
      </div>
      {!visibleTransactions.length && <p className="muted">No TollSpot transactions in this view.</p>}
      <div className="tollspot-transaction-list">
        {visibleTransactions.map((transaction) => {
          const candidateRentals = rentals.filter((rental) => !transaction.vehicle_id || rental.vehicle_id === transaction.vehicle_id);
          return <article key={transaction.id}>
            <div className="tollspot-transaction-heading">
              <div><strong>{money(transaction.total_amount)} • {transaction.agency || 'Toll agency'}</strong><span>{transaction.exit_location || transaction.entry_location || 'Location unavailable'} • {new Date(transaction.occurred_at).toLocaleString()}</span></div>
              <span className={`fleet-status-badge ${transaction.status === 'matched' ? 'available' : transaction.status === 'needs_review' ? 'maintenance' : 'reserved'}`}>{prettyStatus(transaction.status)}</span>
            </div>
            <div className="tollspot-transaction-details">
              <span>{transaction.license_plate || 'No plate'} {transaction.license_plate_state || ''}</span>
              <span>{prettyStatus(transaction.transaction_type || 'tolls')}</span>
              <span>Provider #{transaction.tollspot_transaction_id}</span>
              {transaction.review_reason && <span className="tollspot-review-reason">{transaction.review_reason}</span>}
            </div>
            {openStatuses.has(transaction.status) && <div className="tollspot-review-actions">
              <select aria-label="Rental match" value={matchSelections[transaction.id] || transaction.rental_id || ''} onChange={(event) => setMatchSelections({ ...matchSelections, [transaction.id]: event.target.value })}>
                <option value="">Choose rental</option>
                {candidateRentals.map((rental) => <option key={rental.id} value={rental.id}>{rental.profiles?.full_name || rental.user_email || 'Customer'} • {rental.vehicles?.name || 'Vehicle'} • {formatDateOnly(rental.pickup_date)}–{formatDateOnly(rental.return_date)}</option>)}
              </select>
              <button className="secondary-btn" disabled={busy === `match:${transaction.id}`} onClick={() => matchTransaction(transaction)}>Match Rental</button>
              {transaction.status === 'matched' && <button className="primary-btn" disabled={busy === `charge:${transaction.id}`} onClick={() => createTollCharge(transaction)}>Create Pending Charge</button>}
              <button className="reject" disabled={busy === `ignore:${transaction.id}`} onClick={() => ignoreTransaction(transaction)}>Ignore</button>
            </div>}
          </article>;
        })}
      </div>
    </Panel>
  </section>;
}

function FleetCalendar({ vehicles, rentals, availabilityBlocks, availabilityBlockForm, setAvailabilityBlockForm, editingAvailabilityBlockId, availabilitySaving, availabilityTypes, createAvailabilityBlock, createAvailabilityPaintBlock, updateAvailabilityBlock, editAvailabilityBlock, deleteAvailabilityBlock }) {
  const [viewStart, setViewStart] = useState(() => adminBookingDateOffset(0));
  const [canonicalEvents, setCanonicalEvents] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [vehicleStatusFilter, setVehicleStatusFilter] = useState('all');
  const [paintRange, setPaintRange] = useState(null);
  const [paintModal, setPaintModal] = useState(null);
  const [calendarHint, setCalendarHint] = useState('');
  const [calendarError, setCalendarError] = useState('');
  const [calendarLastUpdated, setCalendarLastUpdated] = useState(null);
  const vehicleRowRefs = useRef(new Map());
  const days = calendarDaysFrom(viewStart, 28);
  const viewEnd = days[days.length - 1]?.iso || viewStart;
  const updateBlock = (key, value) => setAvailabilityBlockForm({ ...availabilityBlockForm, [key]: value });
  const canonicalRentals = canonicalEvents
    .filter((event) => ['rental', 'checkout_hold'].includes(event.event_type))
    .map((event) => ({
      id: event.id,
      vehicle_id: event.vehicle_id,
      pickup_date: event.start_date,
      return_date: event.end_date,
      pickup_time: event.start_time,
      return_time: event.end_time,
      status: event.status,
      profiles: { full_name: event.customer_name },
      booking_source: event.label,
      checkout_expires_at: event.expires_at,
    }));
  const canonicalBlocks = canonicalEvents
    .filter((event) => event.event_type === 'manual_block')
    .map((event) => ({
      id: event.id,
      vehicle_id: event.vehicle_id,
      start_date: event.start_date,
      end_date: event.end_date,
      start_time: event.start_time,
      end_time: event.end_time,
      block_type: event.status,
      label: event.label,
      notes: event.notes,
      active: true,
    }));
  const calendarRentals = canonicalEvents.length || !calendarLoading ? canonicalRentals : rentals;
  const calendarBlocks = canonicalEvents.length || !calendarLoading ? canonicalBlocks : availabilityBlocks;

  async function loadCanonicalCalendar() {
    setCalendarLoading(true);
    const { data, error } = await withRequestDeadline(supabase.rpc('get_admin_calendar_events', {
      p_start_date: viewStart,
      p_end_date: viewEnd,
    }), 'Calendar events');
    if (error) {
      setCalendarError(userFacingPortalError(error, 'Live calendar data could not refresh.'));
    } else {
      setCanonicalEvents(data || []);
      setCalendarError('');
      setCalendarLastUpdated(new Date().toISOString());
    }
    setCalendarLoading(false);
  }

  useEffect(() => {
    loadCanonicalCalendar();
  }, [viewStart, viewEnd]);

  useEffect(() => {
    let refreshTimer;
    const refresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(loadCanonicalCalendar, 150);
    };
    const channel = supabase
      .channel(`fleet-calendar-window-${viewStart}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rentals' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_bookings' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_availability_blocks' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_maintenance_schedules' }, refresh)
      .subscribe();
    return () => {
      window.clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [viewStart, viewEnd]);

  function moveCalendarDays(amount) {
    const next = new Date(`${viewStart}T12:00:00`);
    next.setDate(next.getDate() + amount);
    setViewStart(next.toISOString().slice(0, 10));
  }

  function focusVehicleRow(vehicleId) {
    updateBlock('vehicle_id', vehicleId);
    window.requestAnimationFrame(() => {
      const row = vehicleRowRefs.current.get(vehicleId);
      if (!row) return;
      const scroller = row.closest('.calendar-scroller');
      const rowRect = row.getBoundingClientRect();
      const scrollerRect = scroller?.getBoundingClientRect();
      const visibleTop = Math.max(scrollerRect?.top ?? 0, 0);
      const visibleBottom = Math.min(scrollerRect?.bottom ?? window.innerHeight, window.innerHeight);
      const isVisible = scrollerRect
        && rowRect.top >= visibleTop
        && rowRect.bottom <= visibleBottom;
      if (!isVisible) row.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      row.classList.remove('calendar-row-focus-pulse');
      window.requestAnimationFrame(() => row.classList.add('calendar-row-focus-pulse'));
      window.setTimeout(() => row.classList.remove('calendar-row-focus-pulse'), 1400);
    });
  }

  const filteredVehicles = vehicles.filter((vehicle) => {
    const query = vehicleSearch.trim().toLowerCase();
    if (query && ![vehicle.name, vehicle.brand, vehicle.model, vehicle.plate_number, vehicle.vin].filter(Boolean).some((value) => String(value).toLowerCase().includes(query))) return false;
    if (vehicleStatusFilter === 'all') return true;
    if (vehicleStatusFilter === 'attention') return vehicle.maintenance_lock_active || ['maintenance', 'unavailable'].includes(String(vehicle.status || '').toLowerCase());
    return operationalVehicleStatus(vehicle.status) === vehicleStatusFilter;
  });

  const rentalsByVehicle = useMemo(() => {
    const grouped = {};
    calendarRentals.filter((r) => AVAILABILITY_RENTAL_STATUSES.includes(String(r.status || '').toLowerCase())).forEach((r) => {
      if (!grouped[r.vehicle_id]) grouped[r.vehicle_id] = [];
      grouped[r.vehicle_id].push(r);
    });
    return grouped;
  }, [calendarRentals]);

  const blocksByVehicle = useMemo(() => {
    const grouped = {};
    calendarBlocks.forEach((block) => {
      if (String(block.block_type || '').toLowerCase() === 'available') return;
      if (!grouped[block.vehicle_id]) grouped[block.vehicle_id] = [];
      grouped[block.vehicle_id].push(block);
    });
    return grouped;
  }, [calendarBlocks]);

  const activeVehicle = vehicles.find((vehicle) => vehicle.id === availabilityBlockForm.vehicle_id) || vehicles[0];
  const selectedType = availabilityBlockForm.block_type || 'unavailable';
  const selectedTypeStyle = availabilityTypes[selectedType] || DEFAULT_AVAILABILITY_TYPES[selectedType] || { label: prettyStatus(selectedType), color: '#394852' };

  function openBlockEdit(block) {
    if (!MANUAL_CALENDAR_BLOCK_TYPES.has(String(block?.block_type || '').toLowerCase())) {
      setCalendarHint('This hold was created by the rental system. Manage the related rental or extension request; it cannot be edited or cleared from the calendar.');
      setPaintRange(null);
      return;
    }
    setPaintModal({
      mode: 'edit',
      id: block.id,
      vehicleId: block.vehicle_id,
      startDate: block.start_date,
      endDate: block.end_date,
      startTime: block.start_time || '12:00 AM',
      endTime: block.end_time || '11:59 PM',
      blockType: block.block_type || 'unavailable',
      label: block.label || availabilityTypes[block.block_type]?.label || prettyStatus(block.block_type),
      notes: block.notes || '',
      error: '',
      saving: false,
    });
  }

  function startPaint(vehicleId, dayIso) {
    setCalendarHint('');
    setPaintRange({ vehicleId, startDate: dayIso, endDate: dayIso });
  }

  function updatePaint(vehicleId, dayIso) {
    setPaintRange((current) => current && current.vehicleId === vehicleId ? { ...current, endDate: dayIso } : current);
  }

  function finishPaint(vehicleId, dayIso) {
    setPaintRange((current) => {
      if (current && current.vehicleId === vehicleId) {
        const [startDate, endDate] = [current.startDate, dayIso].sort();
        setPaintModal({
          mode: 'create',
          vehicleId,
          startDate,
          endDate,
          startTime: '12:00 AM',
          endTime: '11:59 PM',
          blockType: selectedType,
          label: calendarActionLabel(selectedType, availabilityTypes),
          notes: '',
          error: '',
          saving: false,
        });
      }
      return null;
    });
  }

  function blockedRentalHint(rental) {
    setCalendarHint(`${availabilityTypes[rentalStatusToAvailabilityType(rental?.status)]?.label || 'Booked'} time comes from a rental. The return-day cell becomes bookable after the shown three-hour turnaround; Available only removes manual calendar blocks.`);
    setPaintRange(null);
  }

  function openAvailableWindow(segment, dayIso) {
    if (selectedType === 'available') {
      setCalendarHint(`${segment.label}. This part of the day is already available after the turnaround window.`);
      return;
    }
    setPaintModal({
      mode: 'create',
      vehicleId: segment.vehicleId,
      startDate: dayIso,
      endDate: dayIso,
      startTime: segment.startTime,
      endTime: segment.endTime,
      blockType: selectedType,
      label: calendarActionLabel(selectedType, availabilityTypes),
      notes: '',
      error: '',
      saving: false,
    });
  }

  function handleGraceSegment(segment, dayIso) {
    setCalendarHint(`Protected three-hour turnaround. The ${formatTimeOnly(segment.dueAt)} return remains unavailable until ${formatTimeOnly(segment.standardAvailableAt)} and cannot be cleared as a normal availability block.`);
    setPaintRange(null);
  }

  function isPreviewed(vehicleId, dayIso) {
    if (!paintRange || paintRange.vehicleId !== vehicleId) return false;
    const [start, end] = [paintRange.startDate, paintRange.endDate].sort();
    return dayIso >= start && dayIso <= end;
  }

  return <Panel title="Fleet Calendar" eyebrow="Date-Based Availability">
    <div className="calendar-toolbar">
      <div>
        <strong>{days[0]?.label} - {days[days.length - 1]?.label}</strong>
        <span>Live customer bookings, checkout holds, admin bookings, manual blocks, and vehicle maintenance locks. Times are Eastern; every return includes the protected three-hour turnaround.</span>
      </div>
      <div className="calendar-date-navigation">
        <button type="button" className="secondary-btn" onClick={() => moveCalendarDays(-14)} aria-label="Previous two weeks">← 2 weeks</button>
        <button type="button" className="secondary-btn" onClick={() => setViewStart(adminBookingDateOffset(0))}><CalendarClock size={16}/> Today</button>
        <button type="button" className="secondary-btn" onClick={() => moveCalendarDays(14)} aria-label="Next two weeks">2 weeks →</button>
      </div>
    </div>
    <div className="calendar-focus-toolbar">
      <div className="search-row"><Search size={17}/><input value={vehicleSearch} maxLength="120" onChange={(event) => setVehicleSearch(limitText(event.target.value, 120))} placeholder="Find vehicle, plate, or VIN…"/></div>
      <select value={vehicleStatusFilter} onChange={(event) => setVehicleStatusFilter(event.target.value)} aria-label="Filter calendar vehicles">
        <option value="all">All vehicle conditions</option>
        <option value="attention">Maintenance attention</option>
        <option value="available">In service</option>
        <option value="maintenance">Maintenance</option>
        <option value="unavailable">Out of service</option>
        <option value="inactive">Inactive</option>
      </select>
      <span>{filteredVehicles.length} of {vehicles.length} vehicles{calendarLoading ? ' • refreshing…' : ''}</span>
    </div>
    {calendarError && <section className="calendar-refresh-error" role="alert">
      <AlertTriangle size={18}/>
      <div><strong>Calendar refresh failed</strong><span>{calendarError}{calendarLastUpdated ? ` Showing the last successful calendar from ${new Date(calendarLastUpdated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : ' Do not rely on empty dates until refresh succeeds.'}</span></div>
      <button type="button" className="secondary-btn" onClick={loadCanonicalCalendar} disabled={calendarLoading}>{calendarLoading ? 'Retrying…' : 'Retry calendar'}</button>
    </section>}
    {calendarHint && <div className="calendar-hint"><AlertTriangle size={16}/><span>{calendarHint}</span></div>}

    <form className="availability-form" onSubmit={createAvailabilityBlock}>
      <select aria-label="Vehicle to block" value={availabilityBlockForm.vehicle_id || activeVehicle?.id || ''} onChange={(event) => focusVehicleRow(event.target.value)} required>
        <option value="">Choose vehicle</option>
        {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}
      </select>
      <select aria-label="Availability block type" value={availabilityBlockForm.block_type} onChange={(event) => updateBlock('block_type', event.target.value)}>
        {manualCalendarActionEntries(availabilityTypes).map(([key]) => <option key={key} value={key}>{calendarActionLabel(key, availabilityTypes)}</option>)}
      </select>
      <input aria-label="Block start date" type="date" value={availabilityBlockForm.start_date} onChange={(event) => updateBlock('start_date', event.target.value)} required />
      <input aria-label="Block end date" type="date" value={availabilityBlockForm.end_date} onChange={(event) => updateBlock('end_date', event.target.value)} required />
      <select aria-label="Block start time" value={availabilityBlockForm.start_time} onChange={(event) => updateBlock('start_time', event.target.value)}>{calendarTimeOptions(availabilityBlockForm.start_time).map((time) => <option key={time} value={time}>{time}</option>)}</select>
      <select aria-label="Block end time" value={availabilityBlockForm.end_time} onChange={(event) => updateBlock('end_time', event.target.value)}>{calendarTimeOptions(availabilityBlockForm.end_time).map((time) => <option key={time} value={time}>{time}</option>)}</select>
      <button className="primary-btn" disabled={availabilitySaving}><Plus size={16}/> {availabilitySaving ? 'Saving…' : editingAvailabilityBlockId ? 'Save Block' : 'Add Block'}</button>
    </form>

    <div className="availability-legend" aria-label="Calendar paint colors">
      {manualCalendarActionEntries(availabilityTypes).map(([key, type]) => (
        <button
          type="button"
          key={key}
          className={selectedType === key ? 'active' : ''}
          onClick={() => updateBlock('block_type', key)}
          aria-pressed={selectedType === key}
          title={key === 'available' ? 'Clear manual blocks' : `Paint ${type.label}`}
        >
          <span className={key === 'available' ? 'clear-swatch' : ''} style={{ backgroundColor: type.color }} />
          {calendarActionLabel(key, availabilityTypes)}
        </button>
      ))}
      <em>Reserved and On the Road appear automatically from rentals. Clear Manual Block never removes rentals, extension holds, or turnaround time.</em>
    </div>

    <div className="calendar-scroller">
      <div className="fleet-calendar">
        <div className="calendar-cell calendar-head sticky-col">Vehicle</div>
        {days.map((day) => <div className="calendar-cell calendar-head" key={day.iso}><strong>{day.weekday}</strong><span>{day.shortLabel}</span></div>)}
        {filteredVehicles.map((vehicle) => {
          const vehicleRentals = rentalsByVehicle[vehicle.id] || [];
          const vehicleBlocks = blocksByVehicle[vehicle.id] || [];
          const vehicleBlocked = vehicle.maintenance_lock_active || BLOCKING_VEHICLE_STATUSES.includes(String(vehicle.status || '').toLowerCase());
          return <React.Fragment key={vehicle.id}>
            <div
              ref={(node) => {
                if (node) vehicleRowRefs.current.set(vehicle.id, node);
                else vehicleRowRefs.current.delete(vehicle.id);
              }}
              className={`calendar-cell sticky-col vehicle-name ${availabilityBlockForm.vehicle_id === vehicle.id ? 'selected-vehicle-row' : ''}`}
            >
              <strong>{vehicle.name}</strong>
              <span>{vehicle.maintenance_lock_active
                ? vehicle.maintenance_lock_reason || 'Maintenance lock'
                : vehicleScheduleStatus(vehicle.status)
                  ? `Schedule: ${vehicleScheduleStatus(vehicle.status) === 'rented' ? 'On the Road' : prettyVehicleStatus(vehicleScheduleStatus(vehicle.status))}`
                  : `Condition: ${operationalVehicleStatusLabel(vehicle.status)}`}</span>
            </div>
            {days.map((day) => {
              const segments = vehicleBlocked ? [] : buildCalendarDaySegments({
                rentals: vehicleRentals,
                blocks: vehicleBlocks,
                dayIso: day.iso,
                vehicleId: vehicle.id,
                availabilityTypes,
              });
              const previewed = isPreviewed(vehicle.id, day.iso);
              const clearPreview = previewed && selectedType === 'available';
              const previewColor = previewed && !clearPreview ? selectedTypeStyle.color : null;
              return <div
                className={`calendar-cell ${vehicleBlocked ? 'maintenance' : segments.length ? 'timeline-day' : 'open'} ${previewed ? 'paint-preview' : ''} ${clearPreview ? 'clear-preview' : ''}`}
                key={`${vehicle.id}-${day.iso}`}
                title={vehicleBlocked ? prettyVehicleStatus(vehicle.status) : segments.length ? segments.map((segment) => segment.title).join('\n') : 'Available'}
                role={!vehicleBlocked && !segments.length ? 'button' : undefined}
                tabIndex={!vehicleBlocked && !segments.length ? 0 : undefined}
                aria-label={!vehicleBlocked && !segments.length ? `${vehicle.name}, ${day.label}, available. Press Enter to apply ${calendarActionLabel(selectedType, availabilityTypes).toLowerCase()}.` : undefined}
                style={previewColor ? { '--block-color': previewColor } : undefined}
                onMouseDown={() => {
                  if (segments.length) return;
                  startPaint(vehicle.id, day.iso);
                }}
                onMouseEnter={() => updatePaint(vehicle.id, day.iso)}
                onMouseUp={() => !segments.length && finishPaint(vehicle.id, day.iso)}
                onKeyDown={(event) => {
                  if (vehicleBlocked || segments.length || !['Enter', ' '].includes(event.key)) return;
                  event.preventDefault();
                  setPaintModal({
                    mode: 'create',
                    vehicleId: vehicle.id,
                    startDate: day.iso,
                    endDate: day.iso,
                    startTime: '12:00 AM',
                    endTime: '11:59 PM',
                    blockType: selectedType,
                    label: calendarActionLabel(selectedType, availabilityTypes),
                    notes: '',
                    error: '',
                    saving: false,
                  });
                }}
              >
                {segments.map((segment) => <button
                  type="button"
                  className={`calendar-time-segment ${segment.kind}`}
                  key={segment.id}
                  title={segment.title}
                  aria-label={segment.kind === 'grace'
                    ? `Protected three-hour turnaround until ${formatTimeOnly(segment.standardAvailableAt)}.`
                    : segment.kind === 'manual-block' && !MANUAL_CALENDAR_BLOCK_TYPES.has(String(segment.item?.block_type || '').toLowerCase())
                      ? `${segment.label}. System controlled.`
                      : `${segment.label}. Click to edit.`}
                  style={{ left: `${segment.left}%`, width: `${segment.width}%`, backgroundColor: segment.color }}
                  onMouseDown={(event) => {
                    event.stopPropagation();
                    if (segment.kind === 'rental') blockedRentalHint(segment.item);
                    else if (segment.kind === 'available') openAvailableWindow(segment, day.iso);
                    else if (segment.kind === 'grace') handleGraceSegment(segment, day.iso);
                    else openBlockEdit(segment.item);
                  }}
                >
                  <span>{segment.label}</span>
                </button>)}
                {vehicleBlocked && <span>{prettyVehicleStatus(vehicle.status)}</span>}
              </div>;
            })}
          </React.Fragment>;
        })}
      </div>
    </div>
    {paintModal && <AvailabilityBlockModal
      modal={paintModal}
      setModal={setPaintModal}
      vehicles={vehicles}
      availabilityTypes={availabilityTypes}
      onCancel={() => setPaintModal(null)}
      onRemove={paintModal.mode === 'edit' ? async (nextModal) => {
        setPaintModal({ ...nextModal, saving: true, error: '' });
        const removed = await deleteAvailabilityBlock(nextModal.id);
        if (removed) setPaintModal(null);
        else setPaintModal((current) => current ? { ...current, saving: false } : current);
      } : undefined}
      onSave={async (nextModal) => {
        setPaintModal({ ...nextModal, saving: true, error: '' });
        try {
          const result = nextModal.mode === 'edit'
            ? await updateAvailabilityBlock(nextModal.id, {
            vehicle_id: nextModal.vehicleId,
            start_date: nextModal.startDate,
            end_date: nextModal.endDate,
            start_time: nextModal.startTime,
            end_time: nextModal.endTime,
            block_type: nextModal.blockType,
            label: nextModal.label,
            notes: nextModal.notes,
            })
            : await createAvailabilityPaintBlock({
            vehicleId: nextModal.vehicleId,
            startDate: nextModal.startDate,
            endDate: nextModal.endDate,
            blockType: nextModal.blockType,
            startTime: nextModal.startTime,
            endTime: nextModal.endTime,
            label: nextModal.label,
            notes: nextModal.notes,
            });
          if (!result?.ok) {
            setPaintModal({ ...nextModal, saving: false, error: result?.error || 'Unable to save this calendar block.' });
            return;
          }
          setPaintModal(null);
        } catch (saveError) {
          setPaintModal({ ...nextModal, saving: false, error: saveError instanceof Error ? saveError.message : 'Unable to save this calendar block.' });
        }
      }}
    />}
  </Panel>;
}

function AvailabilityBlockModal({ modal, setModal, vehicles, availabilityTypes, onCancel, onSave, onRemove }) {
  const dialogRef = useDialogFocus(onCancel);
  const actionEntries = manualCalendarActionEntries(availabilityTypes)
    .filter(([key]) => modal.mode !== 'edit' || key !== 'available');
  const update = (key, value) => {
    setModal((current) => {
      const next = { ...current, [key]: value, error: '' };
      if (key === 'blockType') next.label = availabilityTypes[value]?.label || prettyStatus(value);
      return next;
    });
  };
  const selectedType = availabilityTypes[modal.blockType] || DEFAULT_AVAILABILITY_TYPES[modal.blockType] || DEFAULT_AVAILABILITY_TYPES.unavailable;
  const isClear = modal.blockType === 'available';

  return <div className="admin-modal-backdrop" role="presentation">
    <form ref={dialogRef} className="admin-modal availability-modal" role="dialog" aria-modal="true" aria-label="Calendar availability block" onSubmit={(event) => {
      event.preventDefault();
      onSave(modal);
    }}>
      <div className="admin-modal-header">
        <CalendarClock size={22}/>
        <div>
          <strong>{modal.mode === 'edit' ? 'Edit Calendar Block' : isClear ? 'Clear Availability Blocks' : 'Confirm Calendar Block'}</strong>
          <span>{isClear ? 'Only admin-created blocks are cleared. Rentals, extension holds, and turnaround time stay protected.' : 'Adjust the vehicle, dates, and block type before saving.'}</span>
        </div>
      </div>
      <div className="availability-modal-grid">
        <label><span>Vehicle</span><select value={modal.vehicleId} onChange={(event) => update('vehicleId', event.target.value)}>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}</select></label>
        <label><span>Block type</span><select value={modal.blockType} onChange={(event) => update('blockType', event.target.value)}>{actionEntries.map(([key]) => <option key={key} value={key}>{calendarActionLabel(key, availabilityTypes)}</option>)}</select></label>
        <label><span>Start date</span><input type="date" value={modal.startDate} onChange={(event) => update('startDate', event.target.value)} /></label>
        <label><span>End date</span><input type="date" value={modal.endDate} onChange={(event) => update('endDate', event.target.value)} /></label>
        {!isClear && <label><span>Start time</span><select value={modal.startTime} onChange={(event) => update('startTime', event.target.value)}>{calendarTimeOptions(modal.startTime).map((time) => <option key={time} value={time}>{time}</option>)}</select></label>}
        {!isClear && <label><span>End time</span><select value={modal.endTime} onChange={(event) => update('endTime', event.target.value)}>{calendarTimeOptions(modal.endTime).map((time) => <option key={time} value={time}>{time}</option>)}</select></label>}
      </div>
      <div className="availability-modal-swatch"><span className={isClear ? 'clear-swatch' : ''} style={{ backgroundColor: selectedType.color }} />{calendarActionLabel(modal.blockType, availabilityTypes)}</div>
      {modal.error && <p className="form-error">{modal.error}</p>}
      <div className="modal-actions">
        <button type="button" className="secondary-btn" onClick={onCancel}>Cancel</button>
        {modal.mode === 'edit' && <button type="button" className="availability-remove-btn" disabled={modal.saving} onClick={() => onRemove?.(modal)}><CheckCircle2 size={16}/> Remove Block · Make Available</button>}
        <button type="submit" className="primary-btn" disabled={modal.saving}>{modal.saving ? 'Saving...' : isClear ? 'OK - Clear Dates' : 'OK - Apply Changes'}</button>
      </div>
    </form>
  </div>;
}

function Rentals({ rentals, allRentals = [], focusRentalId, clearRentalFocus, search, setSearch, rentalFilter, setRentalFilter, updateRentalStatus, updateRentalPaymentDeadline, completeRentalReturn, releaseSecurityDeposit, refundRentalPayment, rentalRefunds = [], recordLocalDepositRelease, depositAllocations = [], recordTestPayment, recordExtensionPayment, cancelApprovedExtension, extensionRequests, emergencyExceptions = [], emergencyAuthorized, activateRentalWithEmergencyException, addEmergencyExceptionScope, resolveEmergencyExceptionScope, vehicles, reports, decideExtension, sendManualReminder, openDocument, markDocument, deleteDocument, documents = [], documentsByRentalId, rentalCharges = [], addRentalCharge, waiveRentalCharge, chargeRentalSavedCard, previewRentalAmendment, applyRentalAmendment, emailTemplates = [], smsTemplates = [], notify, sendBookingCompletionLink, uploadAdminBookingDocument, createAdminPaymentLink, rentalStepCompletions = [], completeAdminRentalStep, signAdminRentalAgreement }) {
  const ARCHIVE_PAGE_SIZE = 25;
  const [archiveVisibleCount, setArchiveVisibleCount] = useState(ARCHIVE_PAGE_SIZE);
  useEffect(() => setArchiveVisibleCount(ARCHIVE_PAGE_SIZE), [rentalFilter, search]);
  const matchingRentals = focusRentalId ? rentals.filter((rental) => rental.id === focusRentalId) : rentals;
  const displayedRentals = rentalFilter === 'archive' && !focusRentalId
    ? matchingRentals.slice(0, archiveVisibleCount)
    : matchingRentals;
  const filterCounts = Object.fromEntries(rentalFilterOptions().map((filter) => [
    filter.key,
    allRentals.filter((rental) => rentalMatchesFilter(rental, filter.key, { documents, extensionRequests, vehicles })).length,
  ]));

  return <>
    <Panel title={rentalFilter === 'archive' ? 'Rental Archive' : 'Rental Manager'} eyebrow="Reservations">
      {focusRentalId && <div className="focused-rental-actions"><span className="admin-completion-badge"><CheckCircle2 size={14}/> Admin booking</span><button type="button" className="secondary-btn" onClick={clearRentalFocus}>Show All Rentals</button></div>}
      {!focusRentalId && <>
      <div className="filter-pills" role="group" aria-label="Rental filters">
        {rentalFilterOptions().map((filter) => (
          <button type="button" key={filter.key} className={rentalFilter === filter.key ? 'active' : ''} onClick={() => setRentalFilter(filter.key)}>
            {filter.label} <span className="filter-pill-count">{filterCounts[filter.key] || 0}</span>
          </button>
        ))}
      </div>
      <div className="search-row"><Search size={18}/><input value={search} maxLength="120" onChange={(e)=>setSearch(limitText(e.target.value, 120))} placeholder="Search customer, car, phone, status..." /></div>
      </>}
      {displayedRentals.length === 0 && <p className="muted">No rentals match this view.</p>}
      <div className="table-list">{displayedRentals.map((r) => <RentalRow key={r.id} rental={r} updateRentalStatus={updateRentalStatus} updateRentalPaymentDeadline={updateRentalPaymentDeadline} completeRentalReturn={completeRentalReturn} releaseSecurityDeposit={releaseSecurityDeposit} refundRentalPayment={refundRentalPayment} rentalRefunds={rentalRefunds.filter((item) => item.rental_id === r.id)} recordLocalDepositRelease={recordLocalDepositRelease} depositAllocations={depositAllocations.filter((item) => item.holder_rental_id === r.id)} recordTestPayment={recordTestPayment} recordExtensionPayment={recordExtensionPayment} cancelApprovedExtension={cancelApprovedExtension} extensionRequests={extensionRequests} emergencyExceptions={emergencyExceptions.filter((item) => item.rental_id === r.id)} emergencyAuthorized={emergencyAuthorized} activateRentalWithEmergencyException={activateRentalWithEmergencyException} addEmergencyExceptionScope={addEmergencyExceptionScope} resolveEmergencyExceptionScope={resolveEmergencyExceptionScope} vehicles={vehicles} reports={reports} decideExtension={decideExtension} sendManualReminder={sendManualReminder} detailed rentalDocuments={documentsByRentalId[r.id] || []} allDocuments={documents} openDocument={openDocument} markDocument={markDocument} deleteDocument={deleteDocument} rentalCharges={rentalCharges.filter((charge) => charge.rental_id === r.id)} addRentalCharge={addRentalCharge} waiveRentalCharge={waiveRentalCharge} chargeRentalSavedCard={chargeRentalSavedCard} previewRentalAmendment={previewRentalAmendment} applyRentalAmendment={applyRentalAmendment} emailTemplates={emailTemplates} smsTemplates={smsTemplates} notify={notify} sendBookingCompletionLink={sendBookingCompletionLink} uploadAdminBookingDocument={uploadAdminBookingDocument} createAdminPaymentLink={createAdminPaymentLink} stepCompletions={rentalStepCompletions.filter((item) => item.rental_id === r.id)} completeAdminRentalStep={completeAdminRentalStep} signAdminRentalAgreement={signAdminRentalAgreement} />)}</div>
      {rentalFilter === 'archive' && displayedRentals.length < matchingRentals.length && <button type="button" className="secondary-btn rental-archive-load-more" onClick={() => setArchiveVisibleCount((count) => count + ARCHIVE_PAGE_SIZE)}>Load 25 more archived rentals</button>}
    </Panel>
  </>;
}

function Customers({ profiles, customerDirectoryState, refreshCustomerDirectory, rentals, documentsByUserId, documents, reports, openDocument, emailTemplates, smsTemplates, notify, updateCustomerProfile, deleteCustomerProfile }) {
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [contactCustomerId, setContactCustomerId] = useState('');
  // Administrators can also be renters. Their role still controls authorization,
  // but it must not hide them from customer records or family bookings.
  const customerProfiles = profiles;
  const normalizedSearch = customerSearch.trim().toLowerCase();
  const searchDigits = customerSearch.replace(/\D/g, '');
  const visibleCustomers = customerProfiles.filter((profile) => {
    if (!normalizedSearch) return true;
    const customerRentals = rentals.filter((rental) => rental.user_id === profile.id);
    const textMatch = [
      profile.full_name,
      profile.email,
      profile.phone,
      profile.address,
      profile.customer_status,
      profile.id,
      ...customerRentals.flatMap((rental) => [rental.status, rental.vehicles?.name]),
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedSearch));
    const phoneMatch = searchDigits.length >= 3 && String(profile.phone || '').replace(/\D/g, '').includes(searchDigits);
    return textMatch || phoneMatch;
  });
  const selectedCustomer = customerProfiles.find((profile) => profile.id === selectedCustomerId);
  const contactCustomer = customerProfiles.find((profile) => profile.id === contactCustomerId);

  useEffect(() => {
    if (!selectedCustomer) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedCustomerId('');
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [selectedCustomer?.id]);

  return <>
    <Panel title="Client Accounts" eyebrow="Customers">
      <div className="list-search-toolbar">
        <div className="search-row"><Search size={18}/><input value={customerSearch} maxLength="140" onChange={(event)=>setCustomerSearch(limitText(event.target.value, 140))} placeholder="Search name, email, phone, vehicle, status..." /></div>
        <div className="customer-directory-summary">
          <span>{visibleCustomers.length} of {customerProfiles.length} accounts • clients and administrators included</span>
          <button type="button" className="secondary-btn" onClick={refreshCustomerDirectory} disabled={customerDirectoryState.loading}>
            {customerDirectoryState.loading ? 'Refreshing customers…' : 'Refresh customers'}
          </button>
        </div>
      </div>
      <div className="table-list customer-summary-list">
        {customerDirectoryState.loading && customerProfiles.length === 0 && <p className="muted list-empty-state">Loading customer and administrator accounts…</p>}
        {customerDirectoryState.error && <p className="form-error customer-directory-error" role="alert">Customer accounts could not refresh: {customerDirectoryState.error} <button type="button" onClick={refreshCustomerDirectory}>Try again</button></p>}
        {!customerDirectoryState.loading && !customerDirectoryState.error && visibleCustomers.length === 0 && <p className="muted list-empty-state">No customers match “{customerSearch.trim()}”.</p>}
        {visibleCustomers.map((profile) => {
          const customerRentals = rentals.filter((rental) => rental.user_id === profile.id);
          const customerDocuments = documentsByUserId[profile.id] || [];
          const customerReports = reports.filter((report) => report.user_id === profile.id);
          const risk = customerRiskProfile(profile, customerRentals, customerDocuments, customerReports);
          const latestRental = [...customerRentals].sort((a, b) => new Date(b.created_at || b.pickup_date || 0) - new Date(a.created_at || a.pickup_date || 0))[0];
          return <article className="customer-summary-row" key={profile.id}>
            <div className="customer-summary-identity">
              <span className="customer-initials" aria-hidden="true">{customerInitials(profile.full_name || profile.email)}</span>
              <div>
                <strong>{profile.full_name || 'Unnamed Client'}</strong>
                <span>{profile.email || 'No email saved'}</span>
                <small>{profile.phone || 'No phone saved'} • {profile.phone_verified ? 'Phone verified' : 'Phone unverified'}</small>
                {String(profile.role || '').toLowerCase() === 'admin' && <em className="customer-admin-account-badge">Administrator account • available for assisted rentals</em>}
              </div>
            </div>
            <div className="customer-summary-activity">
              <strong>{customerRentals.length} rental{customerRentals.length === 1 ? '' : 's'}</strong>
              <span>{latestRental?.vehicles?.name || 'No vehicle history'}</span>
              <small>{latestRental ? `${prettyStatus(latestRental.status)} • ${formatRentalDate(latestRental.pickup_date, latestRental.pickup_time)}` : 'No bookings yet'}</small>
            </div>
            <aside className={`customer-risk-summary ${risk.level}`}>
              <span>{prettyStatus(risk.level)} risk</span>
              <small>{risk.summary}</small>
            </aside>
            <div className="customer-row-actions">
              <button className="customer-message-button" type="button" onClick={() => setContactCustomerId(profile.id)}><Send size={15}/> Message</button>
              <button className="customer-details-button" type="button" onClick={() => setSelectedCustomerId(profile.id)}><Eye size={16}/> Details</button>
            </div>
          </article>;
        })}
      </div>
    </Panel>
    {selectedCustomer && <CustomerDetailsModal
      profile={selectedCustomer}
      rentals={rentals.filter((rental) => rental.user_id === selectedCustomer.id)}
      documents={documentsByUserId[selectedCustomer.id] || []}
      reports={reports.filter((report) => report.user_id === selectedCustomer.id)}
      openDocument={openDocument}
      onUpdate={updateCustomerProfile}
      onDelete={deleteCustomerProfile}
      onClose={() => setSelectedCustomerId('')}
    />}
    {contactCustomer && <CustomerContactModal
      profile={contactCustomer}
      rentals={rentals.filter((rental) => rental.user_id === contactCustomer.id)}
      emailTemplates={emailTemplates}
      smsTemplates={smsTemplates}
      notify={notify}
      onClose={() => setContactCustomerId('')}
    />}
  </>;
}

function renderMessagePreview(value, profile, rental, charge, extension) {
  const firstName = String(profile?.full_name || 'Customer').trim().split(/\s+/)[0];
  const variables = {
    customer_name: profile?.full_name || 'Customer', customer_first_name: firstName,
    vehicle_name: rental?.vehicles?.name || 'your rental vehicle',
    pickup_date: rental?.pickup_date ? formatRentalDate(rental.pickup_date, rental.pickup_time).split(' at ')[0] : 'your scheduled date',
    pickup_time: rental?.pickup_time || 'your scheduled time',
    return_date: rental?.return_date ? formatRentalDate(rental.return_date, rental.return_time).split(' at ')[0] : 'your scheduled date',
    return_time: rental?.return_time || 'your scheduled time',
    manage_booking_url: charge || extension ? `${import.meta.env.VITE_CLIENT_PORTAL_URL || 'https://login.rentmect.com'}?billing=1` : import.meta.env.VITE_CLIENT_PORTAL_URL || 'https://login.rentmect.com',
    business_phone: import.meta.env.VITE_RENTMECT_PHONE || '860-558-6031',
    charge_name: charge?.name || 'additional rental charge',
    charge_description: charge?.description || 'Please contact Rent Me CT with any questions.',
    charge_total: money(charge?.total_amount || 0),
    continuation_type: extension?.request_kind === 'switch_car_continuation' ? 'vehicle switch' : 'rental extension',
    requested_return_date: extension?.requested_return_date ? formatRentalDate(extension.requested_return_date, extension.requested_return_time).split(' at ')[0] : 'the approved return date',
    requested_return_time: extension?.requested_return_time || 'the approved return time',
    extension_total: money(extension?.extension_total_amount || 0),
    payment_due_at: extension?.payment_due_at ? new Date(extension.payment_due_at).toLocaleString() : 'the payment deadline shown in your portal',
  };
  return String(value || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => variables[key] || '');
}

function CustomerContactModal({ profile, rentals, emailTemplates = [], smsTemplates = [], notify, initialTemplateKey = '', charge = null, extension = null, onClose }) {
  const dialogRef = useDialogFocus(onClose, { closeOnEscape: false });
  const smsReady = Boolean(profile.phone && profile.phone_verified && profile.sms_transactional_opt_in);
  const initialChannel = smsReady ? 'sms' : profile.email ? 'email' : 'sms';
  const [channel, setChannel] = useState(initialChannel);
  const initialTemplates = initialChannel === 'email' ? emailTemplates : smsTemplates;
  const [templateId, setTemplateId] = useState(initialTemplates.find((template) => template.template_key === initialTemplateKey)?.id || initialTemplates[0]?.id || '');
  const sortedRentals = [...rentals].sort((a, b) => new Date(b.created_at || b.pickup_date || 0) - new Date(a.created_at || a.pickup_date || 0));
  const [rentalId, setRentalId] = useState(sortedRentals[0]?.id || '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const templates = channel === 'email' ? emailTemplates : smsTemplates;
  const selectedTemplate = templates.find((template) => template.id === templateId) || templates[0];
  const selectedRental = sortedRentals.find((rental) => rental.id === rentalId);
  const destination = channel === 'email' ? profile.email : profile.phone;
  const canSendToDestination = channel === 'email' ? Boolean(profile.email) : smsReady;

  useEffect(() => {
    const closeOnEscape = (event) => event.key === 'Escape' && !sending && onClose();
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [sending, onClose]);

  function chooseChannel(nextChannel) {
    setChannel(nextChannel);
    const nextTemplates = nextChannel === 'email' ? emailTemplates : smsTemplates;
    setTemplateId(nextTemplates.find((template) => template.template_key === initialTemplateKey)?.id || nextTemplates[0]?.id || '');
    setError('');
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!canSendToDestination) return setError(channel === 'email' ? 'Add an email address before sending.' : 'A verified phone and active transactional SMS consent are required before sending a text.');
    if (!selectedTemplate) return setError(`No enabled ${channel === 'email' ? 'email' : 'text'} templates are available.`);
    setSending(true);
    setError('');
    try {
      if (channel === 'email') {
        const { data: sessionData } = await supabase.auth.getSession();
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-emails/customer`, {
          method: 'POST',
          headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${sessionData.session?.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerId: profile.id, emailTemplateId: selectedTemplate.id, rentalId: rentalId || null, chargeId: charge?.id || null, extensionRequestId: extension?.id || null }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.error) throw new Error(payload.error || `Email request failed (${response.status}).`);
      } else {
        const { data, error: invokeError } = await supabase.functions.invoke('send-rental-due-reminders', {
          body: { customerId: profile.id, smsTemplateId: selectedTemplate.id, rentalId: rentalId || null, chargeId: charge?.id || null, extensionRequestId: extension?.id || null },
        });
        if (invokeError || data?.error) throw new Error(data?.error || invokeError?.message || 'Text message failed.');
      }
      notify(`${channel === 'email' ? 'Email' : 'Text message'} sent to ${profile.full_name || 'customer'}.`, 'success');
      onClose();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Message could not be sent.');
    } finally {
      setSending(false);
    }
  }

  const preview = channel === 'email'
    ? renderMessagePreview(selectedTemplate?.text_body || selectedTemplate?.subject, profile, selectedRental, charge, extension)
    : renderMessagePreview(selectedTemplate?.body, profile, selectedRental, charge, extension);

  return <div className="admin-modal-backdrop customer-contact-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form ref={dialogRef} className="admin-modal customer-contact-modal" role="dialog" aria-modal="true" aria-label={`Message ${profile.full_name || 'customer'}`} onSubmit={sendMessage}>
      <header className="admin-modal-header customer-contact-header">
        <span className="customer-contact-icon"><MessageCircle size={20}/></span>
        <div><small>Customer communication</small><strong>Send a message</strong><span>{profile.full_name || 'Unnamed Client'}{profile.email ? ` • ${profile.email}` : ''}</span></div>
        <button className="customer-details-close admin-close-button" type="button" onClick={onClose} aria-label="Close"><XCircle size={20}/></button>
      </header>
      <div className="customer-contact-body">
        <div className="contact-channel-toggle" role="group" aria-label="Message channel">
          <button type="button" className={channel === 'sms' ? 'active' : ''} onClick={() => chooseChannel('sms')}><MessageCircle size={16}/> Text</button>
          <button type="button" className={channel === 'email' ? 'active' : ''} onClick={() => chooseChannel('email')}><Mail size={16}/> Email</button>
        </div>
        <div className={`contact-destination ${canSendToDestination ? 'ready' : 'missing'}`}><span className="contact-status-dot"/><div><strong>{destination || `No ${channel === 'email' ? 'email address' : 'phone number'} saved`}</strong><span>{canSendToDestination ? `Ready to send by ${channel === 'email' ? 'SendGrid' : 'Twilio'}` : channel === 'sms' && profile.phone ? 'This number must be verified and have active transactional SMS consent.' : `Add a ${channel === 'email' ? 'customer email address' : 'verified customer phone number with SMS consent'} first.`}</span></div></div>
        <div className={`contact-field-grid ${sortedRentals.length ? '' : 'single'}`}>
          <label><span>Message template</span><select value={selectedTemplate?.id || ''} onChange={(event) => setTemplateId(event.target.value)} disabled={!templates.length}>{templates.length ? templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>) : <option value="">No templates available</option>}</select></label>
          {sortedRentals.length > 0 && <label><span>Related rental</span><select value={rentalId} onChange={(event) => setRentalId(event.target.value)}><option value="">No specific rental</option>{sortedRentals.map((rental) => <option value={rental.id} key={rental.id}>{rental.vehicles?.name || 'Vehicle'} • {formatRentalDate(rental.pickup_date, rental.pickup_time)}</option>)}</select></label>}
        </div>
        {channel === 'email' && selectedTemplate?.subject && <div className="contact-subject"><span>Subject</span><strong>{renderMessagePreview(selectedTemplate.subject, profile, selectedRental, charge, extension)}</strong></div>}
        <div className="contact-preview"><div><span>{channel === 'email' ? 'Email' : 'Text'} preview</span><small>{preview.length} characters</small></div><p>{preview || 'Choose a template to preview the message.'}</p></div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <footer className="customer-contact-actions"><span>{canSendToDestination ? `Will send to ${destination}` : 'A valid destination is required.'}</span><div><button className="contact-cancel" type="button" onClick={onClose}>Cancel</button><button className="contact-send" disabled={sending || !selectedTemplate || !canSendToDestination}><Send size={15}/>{sending ? 'Sending…' : `Send ${channel === 'email' ? 'email' : 'text'}`}</button></div></footer>
    </form>
  </div>;
}

function splitCustomerName(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstAndMiddleName: parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '',
    lastName: parts.length > 1 ? parts.at(-1) : '',
  };
}

function CustomerDetailsModal({ profile, rentals, documents, reports, openDocument, onUpdate, onDelete, onClose }) {
  const dialogRef = useDialogFocus(onClose, { closeOnEscape: false });
  const [openAgreementId, setOpenAgreementId] = useState('');
  const [mode, setMode] = useState('details');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const nameParts = splitCustomerName(profile.full_name);
  const [editForm, setEditForm] = useState({
    firstAndMiddleName: nameParts.firstAndMiddleName,
    lastName: nameParts.lastName,
    email: profile.email || '',
    phone: profile.phone || '',
    dateOfBirth: profile.date_of_birth || '',
    address: profile.address || '',
    intendedVehicleUse: profile.intended_vehicle_use || '',
    adminNotes: profile.admin_notes || '',
  });
  const risk = customerRiskProfile(profile, rentals, documents, reports);
  const age = adminCustomerAge(profile.date_of_birth);
  const identityResults = identityMatchResults(profile);
  const sortedRentals = [...rentals].sort((a, b) => new Date(b.created_at || b.pickup_date || 0) - new Date(a.created_at || a.pickup_date || 0));
  const signedAgreements = sortedRentals.filter((rental) => Boolean(rental.agreement_snapshot));
  const isAdministrator = String(profile.role || '').toLowerCase() === 'admin';

  function updateEditField(field, value, maxLength = 500) {
    setEditForm((current) => ({ ...current, [field]: limitText(value, maxLength) }));
    setFormError('');
  }

  function cancelCustomerAction() {
    const currentName = splitCustomerName(profile.full_name);
    setEditForm({
      firstAndMiddleName: currentName.firstAndMiddleName,
      lastName: currentName.lastName,
      email: profile.email || '',
      phone: profile.phone || '',
      dateOfBirth: profile.date_of_birth || '',
      address: profile.address || '',
      intendedVehicleUse: profile.intended_vehicle_use || '',
      adminNotes: profile.admin_notes || '',
    });
    setDeleteConfirmation('');
    setFormError('');
    setMode('details');
  }

  async function saveCustomer(event) {
    event.preventDefault();
    const firstAndMiddleName = editForm.firstAndMiddleName.trim().replace(/\s+/g, ' ');
    const lastName = editForm.lastName.trim().replace(/\s+/g, ' ');
    if (!firstAndMiddleName || !lastName) {
      setFormError('Enter the customer’s first name and last name. Put any middle name or initial in the first-name field.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await onUpdate(profile.id, {
        fullName: `${firstAndMiddleName} ${lastName}`,
        email: editForm.email,
        phone: editForm.phone,
        dateOfBirth: editForm.dateOfBirth || null,
        address: editForm.address || null,
        intendedVehicleUse: editForm.intendedVehicleUse || null,
        adminNotes: editForm.adminNotes || null,
      });
      setMode('details');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Customer changes could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmCustomerDeletion(event) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await onDelete(profile.id, deleteConfirmation);
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Customer could not be deleted.');
      setSaving(false);
    }
  }

  return <div className="admin-modal-backdrop customer-details-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section ref={dialogRef} className="admin-modal customer-details-modal" role="dialog" aria-modal="true" aria-label={`Customer details for ${profile.full_name || profile.email || 'customer'}`} tabIndex={-1}>
      <header className="admin-modal-header">
        <UserRound size={22}/>
        <div><strong>{profile.full_name || 'Unnamed Client'}</strong><span>{profile.email || profile.id}</span></div>
        <button className="customer-details-close admin-close-button" type="button" onClick={onClose} aria-label="Close customer details"><XCircle size={20}/></button>
      </header>
      <div className="customer-details-scroll">
        <section className="customer-details-overview">
          <div className={`customer-risk-card ${risk.level}`}>
            <span>{prettyStatus(risk.level)} risk</span>
            <strong>{risk.summary}</strong>
            <small>{risk.completed} completed • {risk.late} late/overdue • {risk.rejectedDocs} rejected documents • {risk.openReports} open reports</small>
          </div>
          <div className="customer-status-grid">
            <span className={profile.phone_verified ? 'verified' : 'warning'}><strong>Phone</strong>{profile.phone_verified ? 'Verified' : 'Not verified'}</span>
            <span className={profile.identity_verification_status === 'verified' ? 'verified' : 'warning'}><strong>Identity</strong>{profile.identity_verification_error_code === 'name_mismatch' ? 'Name mismatch — retry required' : prettyStatus(profile.identity_verification_status || 'unverified')}</span>
            <span className={profile.blocked_customer || profile.customer_status === 'blocked' ? 'danger' : 'verified'}><strong>Account</strong>{profile.blocked_customer || profile.customer_status === 'blocked' ? 'Blocked' : prettyStatus(profile.customer_status || 'good')}</span>
            <span className={age !== null && age < 25 ? 'warning' : 'verified'}><strong>Age</strong>{age === null ? 'Not confirmed' : `${age} years old`}</span>
          </div>
          <div className="admin-identity-results" aria-label="Stripe Identity comparison results">
            <strong>Stripe Identity results</strong>
            <div>
              {identityResults.map((item) => <span className={item.tone} key={item.label}><strong>{item.label}</strong>{item.result}</span>)}
            </div>
            {profile.identity_verification_error_code === 'identity_results_access_required' && <small>Stripe received the submission, but the restricted results could not be retrieved. Do not ask the customer to resubmit until the Stripe results access is checked.</small>}
          </div>
        </section>

        <section className="customer-details-section">
          <div className="customer-section-heading">
            <h3>Contact and profile</h3>
            {mode === 'details' && <button className="customer-edit-button" type="button" onClick={() => setMode('edit')}><Pencil size={15}/> Edit customer</button>}
          </div>
          {mode !== 'edit' ? <dl className="customer-detail-grid">
            <div><dt>Email</dt><dd>{profile.email || 'Not provided'}</dd></div>
            <div><dt>Phone</dt><dd>{profile.phone || 'Not provided'}</dd></div>
            <div><dt>Date of birth</dt><dd>{profile.date_of_birth ? new Date(`${profile.date_of_birth}T12:00:00`).toLocaleDateString() : 'Not provided'}</dd></div>
            <div><dt>Deposit tier</dt><dd>{age === null ? 'Age not confirmed' : age < 25 ? '$500 — under 25' : '$300 — age 25+'}</dd></div>
            <div className="wide"><dt>Home address</dt><dd>{profile.address || 'Not provided'}</dd></div>
            <div className="wide"><dt>Intended vehicle use</dt><dd>{profile.intended_vehicle_use || 'Not provided'}</dd></div>
            <div className="wide"><dt>Admin notes</dt><dd>{profile.admin_notes || 'No admin notes'}</dd></div>
          </dl> : <form className="customer-edit-form" id="customer-edit-form" onSubmit={saveCustomer}>
            <div className="customer-edit-name-grid">
              <label><span>First name + middle name or initial</span><input value={editForm.firstAndMiddleName} maxLength="120" onChange={(event) => updateEditField('firstAndMiddleName', event.target.value, 120)} required/><small>Enter any middle name or initial here exactly as shown on the customer’s ID.</small></label>
              <label><span>Last name</span><input value={editForm.lastName} maxLength="80" onChange={(event) => updateEditField('lastName', event.target.value, 80)} required/></label>
            </div>
            <div className="customer-edit-grid">
              <label><span>Email</span><input type="email" value={editForm.email} maxLength="254" onChange={(event) => updateEditField('email', event.target.value, 254)} required/></label>
              <label><span>Mobile number</span><input type="tel" inputMode="tel" value={editForm.phone} maxLength="24" onChange={(event) => updateEditField('phone', event.target.value, 24)}/><small>Changing this number resets phone verification for the new number.</small></label>
              <label><span>Date of birth</span><input type="date" value={editForm.dateOfBirth} onChange={(event) => updateEditField('dateOfBirth', event.target.value, 10)}/></label>
              <label><span>Home address</span><input value={editForm.address} maxLength="500" onChange={(event) => updateEditField('address', event.target.value)}/></label>
              <label className="wide"><span>Intended vehicle use</span><textarea value={editForm.intendedVehicleUse} maxLength="500" onChange={(event) => updateEditField('intendedVehicleUse', event.target.value)}/></label>
              <label className="wide"><span>Admin notes</span><textarea value={editForm.adminNotes} maxLength="2000" onChange={(event) => updateEditField('adminNotes', event.target.value, 2000)}/></label>
            </div>
            {formError && <p className="form-error" role="alert">{formError}</p>}
          </form>}
        </section>

        {mode === 'delete' && <section className="customer-details-section customer-delete-confirmation">
          <div><AlertTriangle size={20}/><div><h3>Delete this customer?</h3><p>The customer will lose portal access and disappear from the active customer directory. Completed rentals, payments, refunds, agreements, and audit records will remain available.</p></div></div>
          <p>Customers with active, upcoming, unpaid, or unresolved rental activity cannot be deleted.</p>
          <form id="customer-delete-form" onSubmit={confirmCustomerDeletion}>
            <label><span>Type <strong>DELETE CUSTOMER</strong> to confirm</span><input value={deleteConfirmation} onChange={(event) => { setDeleteConfirmation(event.target.value); setFormError(''); }} autoComplete="off"/></label>
            {formError && <p className="form-error" role="alert">{formError}</p>}
          </form>
        </section>}

        <section className="customer-details-section">
          <div className="customer-section-heading"><h3>Rental history</h3><span>{sortedRentals.length} total</span></div>
          <div className="customer-rental-history">
            {sortedRentals.length === 0 && <p className="muted">No rentals yet.</p>}
            {sortedRentals.map((rental) => <article key={rental.id}>
              <div><strong>{rental.vehicles?.name || 'Vehicle'}</strong><span>{formatRentalDate(rental.pickup_date, rental.pickup_time)} → {formatRentalDate(rental.return_date, rental.return_time)}</span></div>
              <span className={`workflow-badge ${['completed', 'paid', 'active'].includes(String(rental.status || '').toLowerCase()) ? 'success' : ''}`}>{prettyStatus(rental.status || 'pending')}</span>
            </article>)}
          </div>
        </section>

        <section className="customer-details-section customer-agreements-section">
          <div className="customer-section-heading"><h3>Signed rental agreements</h3><span>{signedAgreements.length} stored</span></div>
          {signedAgreements.length === 0 && <p className="muted">No signed rental agreements are stored for this customer yet.</p>}
          <div className="customer-agreement-list">
            {signedAgreements.map((rental) => {
              const isOpen = openAgreementId === rental.id;
              const signatureImage = extractSignatureImage(rental.agreement_snapshot);
              const printableAgreement = String(rental.agreement_snapshot).replace(
                /Drawn Signature Image:\s*data:image\/png;base64,[^\s]+/,
                'Drawn Signature Image: embedded below',
              );
              return <article className="customer-agreement-record" key={rental.id}>
                <div className="customer-agreement-summary">
                  <div>
                    <strong>{rental.vehicles?.name || 'Rental agreement'}</strong>
                    <span>{formatRentalDate(rental.pickup_date, rental.pickup_time)} → {formatRentalDate(rental.return_date, rental.return_time)}</span>
                    <small>
                      Signed by {rental.agreement_signature_name || 'customer'}
                      {rental.agreement_signed_at ? ` • ${new Date(rental.agreement_signed_at).toLocaleString()}` : ''}
                      {rental.agreement_version ? ` • ${rental.agreement_version}` : ''}
                    </small>
                  </div>
                  <div className="customer-agreement-actions">
                    <button type="button" onClick={() => setOpenAgreementId(isOpen ? '' : rental.id)}><Eye size={15}/>{isOpen ? 'Hide copy' : 'Review copy'}</button>
                    <button type="button" onClick={() => downloadAgreement(rental)}><FileSignature size={15}/>Download</button>
                  </div>
                </div>
                {isOpen && <div className="customer-agreement-copy">
                  <div className="customer-agreement-integrity">
                    <span><strong>Agreement version</strong>{rental.agreement_version || 'Not recorded'}</span>
                    <span><strong>Agreement hash</strong>{rental.agreement_hash || 'Not recorded'}</span>
                    <span><strong>Electronic signature</strong>{signatureImage ? 'Typed and drawn signature stored' : 'Typed signature stored'}</span>
                  </div>
                  <pre>{printableAgreement}</pre>
                  {signatureImage && <div className="customer-agreement-signature"><strong>Stored electronic signature</strong><img src={signatureImage} alt={`Electronic signature for ${rental.agreement_signature_name || 'customer'}`}/></div>}
                </div>}
              </article>;
            })}
          </div>
        </section>

        <section className="customer-details-section">
          <div className="customer-section-heading"><h3>Documents</h3><span>{documents.length} total</span></div>
          <DocumentMiniList documents={documents} openDocument={openDocument} />
          {documents.length === 0 && <p className="muted">No uploaded documents.</p>}
        </section>

        <section className="customer-details-section customer-risk-metrics">
          <h3>Risk totals</h3>
          <div><span>Deposits currently held</span><strong>{money(risk.depositsHeld)}</strong></div>
          <div><span>Deposits released</span><strong>{money(risk.depositsReleased)}</strong></div>
        </section>
      </div>
      <footer className="modal-actions customer-details-actions">
        {mode === 'details' && <>
          {!isAdministrator && <button className="customer-delete-button" type="button" onClick={() => { setMode('delete'); setFormError(''); }}>Delete customer</button>}
          <button className="primary-btn" type="button" onClick={onClose}>Done</button>
        </>}
        {mode === 'edit' && <><button type="button" onClick={cancelCustomerAction} disabled={saving}>Cancel</button><button className="primary-btn" type="submit" form="customer-edit-form" disabled={saving}>{saving ? 'Saving…' : 'Save customer'}</button></>}
        {mode === 'delete' && <><button type="button" onClick={cancelCustomerAction} disabled={saving}>Cancel</button><button className="customer-delete-button" type="submit" form="customer-delete-form" disabled={saving || deleteConfirmation !== 'DELETE CUSTOMER'}>{saving ? 'Deleting…' : 'Delete customer'}</button></>}
      </footer>
    </section>
  </div>;
}

function AuditLog({ auditLogs = [] }) {
  const [query, setQuery] = useState('');
  const [actorFilter, setActorFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const actors = [...new Map(auditLogs.map((log) => {
    const key = log.actor_user_id || log.actor_email || 'system';
    return [key, { key, label: log.actor_email || 'System process' }];
  })).values()].sort((left, right) => left.label.localeCompare(right.label));
  const entities = [...new Set(auditLogs.map((log) => log.entity_type).filter(Boolean))].sort();
  const actions = [...new Set(auditLogs.map((log) => log.action).filter(Boolean))].sort();
  const normalizedQuery = query.trim().toLowerCase();
  const visibleLogs = auditLogs.filter((log) => {
    const actorKey = log.actor_user_id || log.actor_email || 'system';
    if (actorFilter !== 'all' && actorKey !== actorFilter) return false;
    if (entityFilter !== 'all' && log.entity_type !== entityFilter) return false;
    if (actionFilter !== 'all' && log.action !== actionFilter) return false;
    if (!normalizedQuery) return true;
    return [log.actor_email, log.actor_user_id, log.action, log.entity_type, log.entity_id, ...(log.changed_fields || [])]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery));
  });

  return <Panel title="Staff Activity" eyebrow="Audit Log">
    <p className="muted">Immutable history of staff and admin actions. Sensitive document and payment fields are redacted before storage.</p>
    <div className="audit-filters">
      <div className="search-row"><Search size={18}/><input value={query} onChange={(event) => setQuery(limitText(event.target.value, 160))} placeholder="Search staff, action, record ID..." /></div>
      <select aria-label="Filter audit log by staff member" value={actorFilter} onChange={(event) => setActorFilter(event.target.value)}>
        <option value="all">All staff members</option>
        {actors.map((actor) => <option key={actor.key} value={actor.key}>{actor.label}</option>)}
      </select>
      <select aria-label="Filter audit log by record type" value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}>
        <option value="all">All record types</option>
        {entities.map((entity) => <option key={entity} value={entity}>{prettyStatus(entity)}</option>)}
      </select>
      <select aria-label="Filter audit log by action" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
        <option value="all">All actions</option>
        {actions.map((action) => <option key={action} value={action}>{auditActionLabel(action)}</option>)}
      </select>
    </div>
    <div className="audit-summary">Showing {visibleLogs.length} of {auditLogs.length} recorded actions</div>
    <div className="table-list audit-list">
      {visibleLogs.length === 0 && <p className="muted">No audit entries match this view. New entries appear after the audit migration is installed.</p>}
      {visibleLogs.map((log) => <article className="data-row audit-row" key={log.id}>
        <div className="audit-row-main">
          <strong>{auditActionLabel(log.action)}</strong>
          <span>{log.actor_email || 'System process'} <em>{log.actor_role ? `• ${prettyStatus(log.actor_role)}` : ''}</em></span>
          <small>{prettyStatus(log.entity_type || 'record')}{log.entity_id ? ` • ${log.entity_id}` : ''}</small>
          {log.changed_fields?.length > 0 && <small>Changed: {log.changed_fields.map(prettyStatus).join(', ')}</small>}
        </div>
        <div className="audit-row-side">
          <time dateTime={log.created_at}>{log.created_at ? new Date(log.created_at).toLocaleString() : 'Time unavailable'}</time>
          {(log.old_values || log.new_values || Object.keys(log.metadata || {}).length > 0) && <details>
            <summary>View details</summary>
            <pre>{JSON.stringify({ before: log.old_values || undefined, after: log.new_values || undefined, metadata: log.metadata || undefined }, null, 2)}</pre>
          </details>}
        </div>
      </article>)}
    </div>
  </Panel>;
}

function DepositReleaseStatus({ rental }) {
  if (!rental?.security_deposit || rental.deposit_status === 'pending') return null;
  if (rental.deposit_status === 'released') {
    return <small className="deposit-release-status released">Deposit refunded{rental.deposit_released_at ? ` • ${new Date(rental.deposit_released_at).toLocaleString()}` : ''}</small>;
  }
  if (rental.deposit_status === 'release_pending') {
    return <small className="deposit-release-status pending">Deposit refund is processing with Stripe.</small>;
  }
  if (rental.deposit_status === 'transferred') {
    return <small className="deposit-release-status released">Deposit carried to the replacement rental.</small>;
  }
  if (rental.deposit_status === 'adjustment_refund_due') {
    return <small className="deposit-release-status scheduled">{money(rental.deposit_held_amount || rental.deposit_decrease_refund_due || 0)} deposit decrease awaiting original-vehicle inspection/refund{rental.deposit_release_due_at ? ` • scheduled ${new Date(rental.deposit_release_due_at).toLocaleString()}` : ''}</small>;
  }
  if (rental.deposit_status === 'held' && rental.deposit_release_due_at) {
    return <small className="deposit-release-status scheduled">Deposit held • automatic refund scheduled {new Date(rental.deposit_release_due_at).toLocaleString()}</small>;
  }
  if (rental.deposit_status === 'held') {
    return <small className="deposit-release-status held">Deposit held for review; no automatic refund is scheduled.</small>;
  }
  return <small className="deposit-release-status">Deposit: {prettyStatus(rental.deposit_status)}</small>;
}

function ContactCenterTab({ profiles, rentals, messages, selectedRental, onSelectThread, replyText, setReplyText, sendReply, adminEmail, notify, onTemplatesChanged }) {
  const [section, setSection] = useState('inbox');
  const [templateChannel, setTemplateChannel] = useState('email');
  const [templates, setTemplates] = useState([]);
  const [textTemplates, setTextTemplates] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [outbox, setOutbox] = useState([]);
  const [events, setEvents] = useState([]);
  const [loadingEmails, setLoadingEmails] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editingTextTemplate, setEditingTextTemplate] = useState(null);
  const [testEmail, setTestEmail] = useState(adminEmail || '');
  const [composer, setComposer] = useState({
    name: '', templateId: '', subject: '', preheader: '', htmlBody: '<h1>An update from Rent Me CT</h1><p>Hi {{customer_first_name}},</p><p>Write your message here.</p>', textBody: '', audienceType: 'marketing_opted_in', selectedUserIds: [], scheduledFor: '',
  });

  const optedInProfiles = profiles.filter((profile) => profile.email && profile.email_marketing_opt_in && !profile.email_marketing_unsubscribed_at);
  async function loadEmailData(silent = false) {
    if (!silent) setLoadingEmails(true);
    const [templatesRes, textTemplatesRes, campaignsRes, outboxRes, eventsRes] = await Promise.all([
      withRequestDeadline(supabase.from('email_templates').select('*').order('category').order('name'), 'Email templates'),
      withRequestDeadline(supabase.from('sms_templates').select('*').order('category').order('name'), 'Text templates'),
      withRequestDeadline(supabase.from('email_campaigns').select('*').order('created_at', { ascending: false }).limit(100), 'Sent emails'),
      withRequestDeadline(supabase.from('email_outbox').select('*').order('created_at', { ascending: false }).limit(100), 'Email outbox'),
      withRequestDeadline(supabase.from('email_delivery_events').select('*').order('event_at', { ascending: false }).limit(200), 'Delivery events'),
    ]);
    const firstError = templatesRes.error || textTemplatesRes.error || campaignsRes.error || outboxRes.error || eventsRes.error;
    if (firstError) notify(firstError.message);
    if (templatesRes.data) setTemplates(templatesRes.data);
    if (textTemplatesRes.data) setTextTemplates(textTemplatesRes.data);
    if (campaignsRes.data) setCampaigns(campaignsRes.data);
    if (outboxRes.data) setOutbox(outboxRes.data);
    if (eventsRes.data) setEvents(eventsRes.data);
    setLoadingEmails(false);
  }

  useEffect(() => {
    loadEmailData();
  }, []);

  async function invokeEmailAction(path, body) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-emails/${path}`, {
      method: 'POST',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) throw new Error(payload.error || `Email request failed (${response.status}).`);
    return payload;
  }

  async function toggleAutomation(template) {
    const { error } = await supabase.from('email_templates').update({ enabled: !template.enabled, version: Number(template.version || 1) + 1 }).eq('id', template.id);
    if (error) return notify(error.message);
    setTemplates((current) => current.map((item) => item.id === template.id ? { ...item, enabled: !item.enabled } : item));
    notify(`${template.name} ${template.enabled ? 'disabled' : 'enabled'}.`, 'success');
  }

  async function toggleTextAutomation(template) {
    const { error } = await supabase.from('sms_templates').update({ enabled: !template.enabled, version: Number(template.version || 1) + 1 }).eq('id', template.id);
    if (error) return notify(error.message);
    setTextTemplates((current) => current.map((item) => item.id === template.id ? { ...item, enabled: !item.enabled, version: Number(item.version || 1) + 1 } : item));
    await onTemplatesChanged?.();
    notify(`${template.name} ${template.enabled ? 'disabled' : 'enabled'}.`, 'success');
  }

  async function saveTemplate(event) {
    event.preventDefault();
    if (!editingTemplate?.name?.trim() || !editingTemplate?.subject?.trim() || !editingTemplate?.html_body?.trim()) return notify('Template name, subject, and body are required.');
    setBusy(true);
    const values = {
      name: editingTemplate.name.trim(),
      subject: editingTemplate.subject.trim(),
      preheader: editingTemplate.preheader?.trim() || '',
      html_body: editingTemplate.html_body,
      text_body: editingTemplate.text_body || '',
      enabled: editingTemplate.enabled !== false,
      version: Number(editingTemplate.version || 0) + 1,
    };
    const request = editingTemplate.id
      ? supabase.from('email_templates').update(values).eq('id', editingTemplate.id)
      : supabase.from('email_templates').insert({ ...values, template_key: `manual_${Date.now()}`, category: 'manual' });
    const { error } = await request;
    setBusy(false);
    if (error) return notify(error.message);
    setEditingTemplate(null);
    await loadEmailData(true);
    await onTemplatesChanged?.();
    notify('Email template saved.', 'success');
  }

  async function saveTextTemplate(event) {
    event.preventDefault();
    if (!editingTextTemplate?.name?.trim() || !editingTextTemplate?.body?.trim()) return notify('Text template name and message are required.');
    const complianceError = smsTemplateComplianceError(editingTextTemplate.body);
    if (complianceError) return notify(complianceError);
    setBusy(true);
    const values = {
      name: editingTextTemplate.name.trim(),
      body: editingTextTemplate.body.trim(),
      enabled: editingTextTemplate.enabled !== false,
      version: Number(editingTextTemplate.version || 0) + 1,
    };
    const request = editingTextTemplate.id
      ? supabase.from('sms_templates').update(values).eq('id', editingTextTemplate.id)
      : supabase.from('sms_templates').insert({ ...values, template_key: `manual_${Date.now()}`, category: 'manual' });
    const { error } = await request;
    setBusy(false);
    if (error) return notify(error.message);
    setEditingTextTemplate(null);
    await loadEmailData(true);
    await onTemplatesChanged?.();
    notify('Text template saved.', 'success');
  }

  async function sendTemplateTest(template = editingTemplate) {
    if (!template) return;
    setBusy(true);
    try {
      await invokeEmailAction('test', { to: testEmail, subject: template.subject, preheader: template.preheader, htmlBody: template.html_body, textBody: template.text_body });
      notify(`Test email sent to ${testEmail}.`, 'success');
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy(false);
    }
  }

  function useTemplate(templateId) {
    const template = templates.find((item) => item.id === templateId);
    setComposer((current) => ({
      ...current,
      templateId,
      name: current.name || template?.name || '',
      subject: template?.subject || current.subject,
      preheader: template?.preheader || '',
      htmlBody: template?.html_body || current.htmlBody,
      textBody: template?.text_body || '',
    }));
  }

  async function sendCampaign(schedule = false) {
    if (!composer.name.trim() || !composer.subject.trim() || !composer.htmlBody.trim()) return notify('Email name, subject, and body are required.');
    if (schedule && !composer.scheduledFor) return notify('Choose a scheduled date and time.');
    const audienceCount = composer.audienceType === 'selected' ? composer.selectedUserIds.length : optedInProfiles.length;
    if (!audienceCount) return notify('No opted-in customers match this audience.');
    const action = schedule ? `schedule this email for ${new Date(composer.scheduledFor).toLocaleString()}` : `send this email to the selected audience now`;
    if (!window.confirm(`Confirm that you want to ${action}. Eligible recipient preview: ${audienceCount}.`)) return;
    setBusy(true);
    try {
      await invokeEmailAction('campaign', {
        name: composer.name,
        templateId: composer.templateId || null,
        subject: composer.subject,
        preheader: composer.preheader,
        htmlBody: composer.htmlBody,
        textBody: composer.textBody,
        audienceType: composer.audienceType,
        selectedUserIds: composer.selectedUserIds,
        scheduledFor: schedule ? new Date(composer.scheduledFor).toISOString() : null,
      });
      setComposer({ name: '', templateId: '', subject: '', preheader: '', htmlBody: '<h1>An update from Rent Me CT</h1><p>Hi {{customer_first_name}},</p><p>Write your message here.</p>', textBody: '', audienceType: 'marketing_opted_in', selectedUserIds: [], scheduledFor: '' });
      await loadEmailData(true);
      setSection('emails');
      notify(schedule ? 'Email scheduled.' : 'Email sending started.', 'success');
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy(false);
    }
  }

  if (loadingEmails) return <Panel title="Communications" eyebrow="Inbox, Email & Text"><p className="muted">Loading conversations, templates, and delivery settings…</p></Panel>;

  const automated = templates.filter((template) => template.category === 'automated');
  const manual = templates.filter((template) => template.category === 'manual');
  const automatedTexts = textTemplates.filter((template) => template.category === 'automated');
  const manualTexts = textTemplates.filter((template) => template.category === 'manual');
  const editorPreview = editingTemplate ? emailAdminPreview(editingTemplate.html_body, editingTemplate.preheader) : '';
  const composerPreview = emailAdminPreview(composer.htmlBody, composer.preheader);

  return <section className="email-admin-shell">
    <div className="email-admin-header">
      <div><p className="eyebrow">Customer Communications</p><h2>Communications</h2><span>Reply to customers, send direct email or text, manage templates and automations, and review delivery.</span></div>
      <div className="email-admin-health"><MessageCircle size={19}/><strong>{messages.filter((message) => !message.read_by_admin && message.sender_role !== 'admin').length}</strong><span>unread messages</span></div>
    </div>
    <div className="email-admin-tabs" role="tablist">
      {[['inbox', 'Inbox'], ['emails', 'Emails'], ['setup', 'Messaging Setup']].map(([key, label]) => <button key={key} className={section === key ? 'active' : ''} onClick={() => setSection(key)}>{label}</button>)}
    </div>

    {section === 'inbox' && <CommunicationsInbox rentals={rentals} messages={messages} selectedRental={selectedRental} onSelectThread={onSelectThread} replyText={replyText} setReplyText={setReplyText} sendReply={sendReply} />}

    {section === 'emails' && <>
      <div className="email-section-heading"><div><p className="eyebrow">Customer Lifecycle</p><h3>Automated Rental Emails</h3><span>Booking confirmations, payment notices, document updates, reminders, refunds, and cancellations.</span></div><span className="email-template-count">{automated.length} emails</span></div>
      <div className="email-card-grid">
      {automated.map((template) => <article className="email-setting-card" key={template.id}>
        <div><span className={`email-status-dot ${template.enabled ? 'enabled' : ''}`}/><div><strong>{template.name}</strong><small>Email • Trigger: {prettyStatus(template.trigger_key || 'manual')}</small></div></div>
        <p>{template.subject}</p>
        <div className="email-card-actions"><button className="secondary-btn" onClick={() => setEditingTemplate({ ...template })}><Pencil size={15}/> Edit</button><button className={template.enabled ? 'secondary-btn' : 'primary-btn'} onClick={() => toggleAutomation(template)}>{template.enabled ? 'Disable' : 'Enable'}</button></div>
      </article>)}
      {!automated.length && <p className="muted">No automated rental emails are installed.</p>}
      </div>
    </>}

    {section === 'setup' && <div className="email-card-grid">
      {automatedTexts.map((template) => <article className="email-setting-card" key={template.id}>
        <div><span className={`email-status-dot ${template.enabled ? 'enabled' : ''}`}/><div><strong>{template.name}</strong><small>Text message • {prettyStatus(template.template_key)}</small></div></div>
        <p>{template.body}</p>
        <div className="email-card-actions"><button className="secondary-btn" onClick={() => setEditingTextTemplate({ ...template })}><Pencil size={15}/> Edit</button><button className={template.enabled ? 'secondary-btn' : 'primary-btn'} onClick={() => toggleTextAutomation(template)}>{template.enabled ? 'Disable' : 'Enable'}</button></div>
      </article>)}
      {!automatedTexts.length && <p className="muted">No automated text templates are installed. SMS remains separate from rental email automation.</p>}
    </div>}

    {section === 'setup' && <Panel title="Reusable Templates" eyebrow="Email & Text Library">
      <div className="communications-template-toolbar">
        <div className="contact-channel-toggle" role="group" aria-label="Template type"><button type="button" className={templateChannel === 'email' ? 'active' : ''} onClick={() => setTemplateChannel('email')}><Mail size={16}/> Email</button><button type="button" className={templateChannel === 'sms' ? 'active' : ''} onClick={() => setTemplateChannel('sms')}><MessageCircle size={16}/> Text</button></div>
        {templateChannel === 'email'
          ? <button className="primary-btn" onClick={() => setEditingTemplate({ name: '', subject: '', preheader: '', html_body: '<h1>An update from Rent Me CT</h1><p>Hi {{customer_first_name}},</p><p>Write your message here.</p>', text_body: '', enabled: true, category: 'manual', version: 0 })}><Plus size={16}/> Add Email Template</button>
          : <button className="primary-btn" onClick={() => setEditingTextTemplate({ name: '', body: 'Hi {{customer_first_name}}, ', enabled: true, category: 'manual', version: 0 })}><Plus size={16}/> Add Text Template</button>}
      </div>
      {templateChannel === 'email' && <><p className="muted">Reusable one-to-one email templates for customer updates and reminders.</p><div className="email-template-list">{manual.map((template) => <button key={template.id} onClick={() => setEditingTemplate({ ...template })}><Mail size={18}/><span><strong>{template.name}</strong><small>{template.subject}</small></span><em>v{template.version}</em></button>)}{!manual.length && <p className="muted">No manual email templates yet.</p>}</div></>}
      {templateChannel === 'sms' && <><p className="muted">Reusable text templates. Variables such as {'{{customer_first_name}}'}, {'{{vehicle_name}}'}, and {'{{manage_booking_url}}'} are filled when sent.</p>
      <div className="email-template-list contact-text-template-list">
        {manualTexts.map((template) => <button key={template.id} onClick={() => setEditingTextTemplate({ ...template })}><MessageCircle size={18}/><span><strong>{template.name}</strong><small>{template.body}</small></span><em>v{template.version}</em></button>)}
        {!manualTexts.length && <p className="muted">No manual text templates yet.</p>}
      </div></>}
    </Panel>}

    {section === 'emails' && <div className="email-compose-layout">
      <Panel title="Send Custom Email" eyebrow="Optional Bulk Email">
        <div className="portal-form email-compose-form">
          <input placeholder="Email name (internal only)" value={composer.name} onChange={(event) => setComposer({ ...composer, name: limitText(event.target.value, 120) })}/>
          <label className="field-label">Start from template<select value={composer.templateId} onChange={(event) => useTemplate(event.target.value)}><option value="">Blank/custom</option>{manual.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
          <input placeholder="Email subject" value={composer.subject} onChange={(event) => setComposer({ ...composer, subject: limitText(event.target.value, 200) })}/>
          <input placeholder="Preview text" value={composer.preheader} onChange={(event) => setComposer({ ...composer, preheader: limitText(event.target.value, 240) })}/>
          <label className="field-label email-body-field">Email body <small>HTML and variables such as {'{{customer_first_name}}'} are supported.</small><textarea value={composer.htmlBody} onChange={(event) => setComposer({ ...composer, htmlBody: limitText(event.target.value, 30000) })}/></label>
          <label className="field-label">Audience<select value={composer.audienceType} onChange={(event) => setComposer({ ...composer, audienceType: event.target.value, selectedUserIds: [] })}><option value="marketing_opted_in">All opted-in customers</option><option value="active_rentals">Opted-in customers with active rentals</option><option value="upcoming_pickups">Opted-in customers with upcoming pickups</option><option value="past_customers">Opted-in past customers</option><option value="selected">Selected opted-in customers</option></select></label>
          {composer.audienceType === 'selected' && <div className="email-recipient-picker">{optedInProfiles.map((profile) => <label key={profile.id}><input type="checkbox" checked={composer.selectedUserIds.includes(profile.id)} onChange={(event) => setComposer({ ...composer, selectedUserIds: event.target.checked ? [...composer.selectedUserIds, profile.id] : composer.selectedUserIds.filter((id) => id !== profile.id) })}/><span>{profile.full_name || profile.email}<small>{profile.email}</small></span></label>)}</div>}
          <label className="field-label">Schedule (optional)<input type="datetime-local" value={composer.scheduledFor} onChange={(event) => setComposer({ ...composer, scheduledFor: event.target.value })}/></label>
          <div className="email-send-actions"><button className="secondary-btn" disabled={busy} onClick={() => sendTemplateTest({ subject: composer.subject, preheader: composer.preheader, html_body: composer.htmlBody, text_body: composer.textBody })}><Send size={15}/> Send Test</button><input type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} aria-label="Test recipient"/><button className="secondary-btn" disabled={busy || !composer.scheduledFor} onClick={() => sendCampaign(true)}>Schedule</button><button className="primary-btn" disabled={busy} onClick={() => sendCampaign(false)}><Send size={16}/> Send Now</button></div>
        </div>
      </Panel>
      <Panel title="Preview" eyebrow="Customer View"><iframe className="email-preview-frame" title="Email preview" sandbox="" srcDoc={composerPreview}/></Panel>
    </div>}

    {section === 'emails' && <div className="email-history-grid">
      <Panel title="Sent & Scheduled Emails" eyebrow="Custom Emails"><div className="email-history-list">{campaigns.map((campaign) => <article key={campaign.id}><span className={`email-history-status ${campaign.status}`}>{prettyStatus(campaign.status)}</span><div><strong>{campaign.name}</strong><small>{campaign.subject}</small></div><em>{campaign.sent_count || 0}/{campaign.recipient_count || 0} sent</em></article>)}{!campaigns.length && <p className="muted">No custom emails yet.</p>}</div></Panel>
      <Panel title="Automated Queue" eyebrow="Transactional"><div className="email-history-list">{outbox.map((job) => <article key={job.id}><span className={`email-history-status ${job.status}`}>{prettyStatus(job.status)}</span><div><strong>{prettyStatus(job.email_type)}</strong><small>{job.recipient_email}</small></div><em>{job.sent_at ? new Date(job.sent_at).toLocaleString() : job.last_error || 'Queued'}</em></article>)}{!outbox.length && <p className="muted">No automated emails queued yet.</p>}</div></Panel>
      <Panel title="Recent Provider Events" eyebrow="SendGrid"><div className="email-history-list">{events.slice(0, 50).map((event) => <article key={event.id}><span className={`email-history-status ${event.event_type}`}>{prettyStatus(event.event_type)}</span><div><strong>{event.email || 'Recipient unavailable'}</strong><small>{event.provider_message_id || 'SendGrid event'}</small></div><em>{new Date(event.event_at).toLocaleString()}</em></article>)}{!events.length && <p className="muted">Delivery events will appear after the SendGrid webhook is connected.</p>}</div></Panel>
    </div>}

    {editingTemplate && <div className="admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingTemplate(null); }}>
      <form className="admin-modal email-template-modal" onSubmit={saveTemplate}>
        <div className="admin-modal-header"><Mail size={21}/><div><strong>{editingTemplate.id ? 'Edit Email Template' : 'Add Email Template'}</strong><span>Versioned content sent through Twilio SendGrid</span></div><button type="button" className="vehicle-editor-close admin-close-button" onClick={() => setEditingTemplate(null)} aria-label="Close email template editor"><X size={19}/></button></div>
        <div className="email-template-editor"><div className="portal-form"><input placeholder="Template name" value={editingTemplate.name} onChange={(event) => setEditingTemplate({ ...editingTemplate, name: limitText(event.target.value, 120) })}/><input placeholder="Subject" value={editingTemplate.subject} onChange={(event) => setEditingTemplate({ ...editingTemplate, subject: limitText(event.target.value, 200) })}/><input placeholder="Preview text" value={editingTemplate.preheader || ''} onChange={(event) => setEditingTemplate({ ...editingTemplate, preheader: limitText(event.target.value, 240) })}/><label className="field-label email-body-field">Email body<textarea value={editingTemplate.html_body} onChange={(event) => setEditingTemplate({ ...editingTemplate, html_body: limitText(event.target.value, 30000) })}/></label><label className="checkbox-pill"><input type="checkbox" checked={editingTemplate.enabled !== false} onChange={(event) => setEditingTemplate({ ...editingTemplate, enabled: event.target.checked })}/> Enabled</label><div className="email-send-actions"><input type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)}/><button type="button" className="secondary-btn" disabled={busy} onClick={() => sendTemplateTest()}><Send size={15}/> Send Test</button></div></div><iframe className="email-preview-frame" title="Template preview" sandbox="" srcDoc={editorPreview}/></div>
        <div className="modal-actions"><button type="button" className="secondary-btn" onClick={() => setEditingTemplate(null)}>Cancel</button><button className="approve" disabled={busy}><CheckCircle2 size={16}/> Save Template</button></div>
      </form>
    </div>}

    {editingTextTemplate && <div className="admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingTextTemplate(null); }}>
      <form className="admin-modal contact-text-template-modal" onSubmit={saveTextTemplate}>
        <div className="admin-modal-header"><MessageCircle size={21}/><div><strong>{editingTextTemplate.id ? 'Edit Text Template' : 'Add Text Template'}</strong><span>{prettyStatus(editingTextTemplate.category || 'manual')} customer SMS content</span></div><button type="button" className="vehicle-editor-close admin-close-button" onClick={() => setEditingTextTemplate(null)} aria-label="Close text template editor"><X size={19}/></button></div>
        <div className="portal-form contact-text-template-editor">
          <label><span>Template name</span><input required maxLength="120" value={editingTextTemplate.name || ''} onChange={(event) => setEditingTextTemplate({ ...editingTextTemplate, name: limitText(event.target.value, 120) })}/></label>
          <label className="full-field"><span>Text message</span><textarea required maxLength={SMS_TEMPLATE_MAX_LENGTH} value={editingTextTemplate.body || ''} onChange={(event) => setEditingTextTemplate({ ...editingTextTemplate, body: limitText(event.target.value, SMS_TEMPLATE_MAX_LENGTH) })}/><small>{String(editingTextTemplate.body || '').length}/{SMS_TEMPLATE_MAX_LENGTH} characters before variables are rendered.</small></label>
          <div className="contact-variable-help full-field"><strong>Required in every template</strong><span>Identify Rent Me CT and include: {SMS_COMPLIANCE_FOOTER}</span></div>
          <label className="checkbox-pill full-field"><input type="checkbox" checked={editingTextTemplate.enabled !== false} onChange={(event) => setEditingTextTemplate({ ...editingTextTemplate, enabled: event.target.checked })}/> Enabled for admin use</label>
          <div className="contact-variable-help full-field"><strong>Available variables</strong><span>{'{{customer_first_name}}'} · {'{{vehicle_name}}'} · {'{{pickup_date}}'} · {'{{pickup_time}}'} · {'{{return_date}}'} · {'{{return_time}}'} · {'{{manage_booking_url}}'} · {'{{business_phone}}'} · {'{{charge_name}}'} · {'{{charge_total}}'}</span></div>
        </div>
        <div className="modal-actions"><button type="button" className="secondary-btn" onClick={() => setEditingTextTemplate(null)}>Cancel</button><button className="approve" disabled={busy}><CheckCircle2 size={16}/> Save Text Template</button></div>
      </form>
    </div>}
  </section>;
}

function emailAdminPreview(htmlBody, preheader = '') {
  const variables = { customer_first_name: 'Alex', customer_name: 'Alex Customer', booking_number: 'A1B2C3D4E5', vehicle_name: 'Ford F-350 4X4 #191', pickup_date: 'Jul 25, 2026', pickup_time: '9:00 AM', return_date: 'Jul 27, 2026', return_time: '9:00 AM', requested_return_date: 'Jul 28, 2026', requested_return_time: '6:00 PM', rental_total: '$200.00', service_fee_total: '$35.00', tax_amount: '$14.92', deposit_amount: '$300.00', total_paid: '$549.92', extension_total: '$106.35', charge_name: 'Connecticut toll', charge_description: 'Toll recorded during the rental.', charge_total: '$10.64', manage_booking_url: 'https://login.rentmect.com', business_address: '12 Holmes Circle, Farmington, CT' };
  const rendered = String(htmlBody || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => variables[key] || '');
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif"><div style="display:none">${preheader || ''}</div><table width="100%" cellpadding="0" cellspacing="0" style="padding:18px"><tr><td align="center"><table width="100%" style="max-width:620px;background:#fff;border:1px solid #ddd"><tr><td style="padding:20px 26px;background:#050505;color:#fff;font-size:22px;font-weight:800">RENT ME CT</td></tr><tr><td style="padding:28px;line-height:1.6">${rendered}<hr style="border:0;border-top:1px solid #ddd;margin-top:26px"><small>Rent Me CT · 12 Holmes Circle, Farmington, CT</small></td></tr></table></td></tr></table></body></html>`;
}

function VehicleIdentityFields({ form, onChange }) {
  const currentType = String(form.vehicle_type || '').trim().toLowerCase();
  const includesCurrentType = VEHICLE_TYPE_OPTIONS.some(([value]) => value === currentType);

  return <div className="vehicle-form-grid">
    <label className="field-label">Vehicle name<input placeholder="Audi Q5 #474" maxLength="80" value={form.name} onChange={(event)=>onChange('name', event.target.value)} required /></label>
    <label className="field-label">Brand<input placeholder="Audi" maxLength="40" value={form.brand} onChange={(event)=>onChange('brand', event.target.value)} /></label>
    <label className="field-label">Model<input placeholder="Q5" maxLength="40" value={form.model} onChange={(event)=>onChange('model', event.target.value)} /></label>
    <label className="field-label">Vehicle type<select value={currentType} onChange={(event)=>onChange('vehicle_type', event.target.value)} required>
      <option value="">Choose vehicle type</option>
      {VEHICLE_TYPE_OPTIONS.map(([value, label])=><option key={value} value={value}>{label}</option>)}
      {currentType && !includesCurrentType && <option value={currentType}>{prettyStatus(form.vehicle_type)}</option>}
    </select></label>
    <label className="field-label">Plate number<input placeholder="Plate number" maxLength={PLATE_MAX_LENGTH} value={form.plate_number} onChange={(event)=>onChange('plate_number', event.target.value)} title={`Plate number, ${PLATE_MAX_LENGTH} characters max`} /></label>
    <label className="field-label">VIN<input placeholder="17 characters" minLength={VIN_MAX_LENGTH} maxLength={VIN_MAX_LENGTH} pattern="[A-HJ-NPR-Z0-9]{17}" title="VIN must be 17 characters. Letters I, O, and Q are not used in VINs." value={form.vin} onChange={(event)=>onChange('vin', event.target.value)} /></label>
  </div>;
}

function VehicleOperationsFields({ form, onChange, statusOptions, vehicle = null }) {
  const scheduleStatus = vehicle ? vehicleScheduleStatus(vehicle.status) : '';

  return <div className="vehicle-form-grid">
    <label className="field-label">Daily rate<input type="number" step="0.01" min="0" max={MONEY_MAX} inputMode="decimal" placeholder="$0.00" title="Daily rate in USD" value={form.daily_rate} onChange={(event)=>onChange('daily_rate', event.target.value)} required /></label>
    <label className="field-label">Refundable deposit<input type="number" step="0.01" min="0" max={MONEY_MAX} inputMode="decimal" placeholder="$300.00" title="Base refundable deposit for this vehicle" value={form.security_deposit} onChange={(event)=>onChange('security_deposit', event.target.value)} required /></label>
    <label className="field-label">Original odometer mileage<input type="number" min="0" max={MILEAGE_MAX} step="1" inputMode="numeric" value={form.original_mileage} onChange={(event)=>onChange('original_mileage', event.target.value)} required /></label>
    <label className="field-label">Current odometer mileage<input type="number" min={form.original_mileage || 0} max={MILEAGE_MAX} step="1" inputMode="numeric" value={form.current_mileage} onChange={(event)=>onChange('current_mileage', event.target.value)} required /></label>
    <label className="field-label">Maintenance interval<select value={form.maintenance_interval_miles} onChange={(event)=>onChange('maintenance_interval_miles', event.target.value)}>
      <option value="3000">Every 3,000 miles</option>
      <option value="5000">Every 5,000 miles</option>
      <option value="7500">Every 7,500 miles</option>
      <option value="10000">Every 10,000 miles</option>
    </select></label>
    <label className="field-label">Last service mileage <span className="field-optional">Optional</span><input type="number" min="0" max={MILEAGE_MAX} step="1" inputMode="numeric" value={form.last_maintenance_mileage} onChange={(event)=>onChange('last_maintenance_mileage', event.target.value)} placeholder="Defaults to current mileage" /></label>
    {scheduleStatus ? (
      <div className="vehicle-system-state-note">
        <strong>Schedule: {vehicleScheduleStatusLabel(vehicle.status)}</strong>
        <span>This state comes from the active rental and cannot be overridden here.</span>
      </div>
    ) : (
      <label className="field-label">{vehicle ? 'Vehicle condition' : 'Initial condition'}<select value={form.status} onChange={(event)=>onChange('status', event.target.value)}>{statusOptions.map(([key, label])=><option key={key} value={key}>{label}</option>)}</select></label>
    )}
    <label className="vehicle-publish-control">
      <input type="checkbox" checked={form.published} onChange={(event)=>onChange('published', event.target.checked)} />
      <span><strong>{vehicle ? 'Published' : 'Publish immediately'}</strong><small>{vehicle ? 'Turn this off to remove the vehicle from customer-facing fleet views.' : 'Published vehicles appear in customer-facing fleet views. Leave this off to save a draft.'}</small></span>
    </label>
  </div>;
}

function Vehicles({ vehicles, maintenanceSchedules = [], maintenanceServiceLogs = [], vehicleForm, setVehicleForm, addVehicle, updateVehicleStatus, updateVehiclePublished, completeMaintenanceSchedule, saveMaintenanceSchedule, overrideVehicleMaintenance, editingVehicleId, editVehicleForm, setEditVehicleForm, startEditVehicle, cancelEditVehicle, saveVehicleEdit, deleteVehicle, notify }) {
  const [selectedVehicleId, setSelectedVehicleId] = useState(vehicles[0]?.id || '');
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [imageUploadBusy, setImageUploadBusy] = useState(false);
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const [vehicleActionBusy, setVehicleActionBusy] = useState({});
  const [vehicleStatusUndo, setVehicleStatusUndo] = useState({});
  const normalizeVehicleField = (key, value) => {
    if (key === 'vin') return normalizeVinInput(value);
    if (key === 'plate_number') return normalizePlateInput(value);
    if (key === 'name') return limitText(value, 80);
    if (['brand', 'model', 'vehicle_type'].includes(key)) return limitText(value, 40);
    if (key === 'description') return limitText(value, 600);
    if (key === 'features') return limitText(value, 1200);
    if (key === 'image_urls') return limitText(value, 8000);
    return value;
  };
  const update = (k, v) => setVehicleForm({ ...vehicleForm, [k]: normalizeVehicleField(k, v) });
  const updateEdit = (k, v) => setEditVehicleForm({ ...editVehicleForm, [k]: normalizeVehicleField(k, v) });
  const statusOptions = OPERATIONAL_VEHICLE_STATUS_OPTIONS;
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleId) || vehicles[0];
  const editingVehicle = vehicles.find((vehicle) => vehicle.id === editingVehicleId);
  const normalizedVehicleSearch = vehicleSearch.trim().toLowerCase();
  const visibleVehicles = vehicles.filter((vehicle) => {
    if (!normalizedVehicleSearch) return true;
    return [
      vehicle.name,
      vehicle.brand,
      vehicle.model,
      vehicle.vehicle_type,
      vehicle.plate_number,
      vehicle.vin,
      vehicle.status,
      ...(Array.isArray(vehicle.features) ? vehicle.features : []),
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedVehicleSearch));
  });

  useEffect(() => {
    if (!selectedVehicleId && vehicles[0]) setSelectedVehicleId(vehicles[0].id);
  }, [selectedVehicleId, vehicles]);

  useEffect(() => {
    if (!editingVehicle) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') cancelEditVehicle();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [editingVehicle?.id]);

  useEffect(() => {
    if (!addVehicleOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setAddVehicleOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [addVehicleOpen]);

  function closeAddVehicle() {
    setAddVehicleOpen(false);
    setVehicleForm(createEmptyVehicleForm());
  }

  function selectVehicle(vehicle) {
    setSelectedVehicleId(vehicle.id);
  }

  function openVehicleEditor(vehicle) {
    setSelectedVehicleId(vehicle.id);
    startEditVehicle(vehicle);
  }

  async function runVehicleAction(vehicleId, action, operation) {
    const key = `${vehicleId}:${action}`;
    if (vehicleActionBusy[key]) return;
    setVehicleActionBusy((current) => ({ ...current, [key]: true }));
    try {
      await operation();
    } finally {
      setVehicleActionBusy((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  async function changeVehicleCondition(vehicle, nextStatus) {
    const previousStatus = operationalVehicleStatus(vehicle.status);
    if (previousStatus === nextStatus) return;
    const saved = await updateVehicleStatus(vehicle.id, nextStatus);
    if (!saved) return;
    setVehicleStatusUndo((current) => ({
      ...current,
      [vehicle.id]: { previousStatus, nextStatus },
    }));
  }

  async function undoVehicleCondition(vehicle) {
    const undo = vehicleStatusUndo[vehicle.id];
    if (!undo || operationalVehicleStatus(vehicle.status) !== undo.nextStatus) return;
    const saved = await updateVehicleStatus(vehicle.id, undo.previousStatus);
    if (!saved) return;
    setVehicleStatusUndo((current) => {
      const next = { ...current };
      delete next[vehicle.id];
      return next;
    });
  }

  async function addUploadedVehicleImages(files, editing = false) {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;

    const currentUrls = linesToList(editing ? editVehicleForm?.image_urls : vehicleForm.image_urls);
    if (currentUrls.length + selectedFiles.length > MAX_VEHICLE_IMAGES) {
      notify(`Keep each vehicle to ${MAX_VEHICLE_IMAGES} pictures or fewer. Remove an existing picture before uploading more.`);
      return;
    }

    setImageUploadBusy(true);
    try {
      const uploadedUrls = await uploadOptimizedVehicleImages(selectedFiles);
      const setter = editing ? setEditVehicleForm : setVehicleForm;
      setter((current) => ({
        ...current,
        image_urls: listToLines([...linesToList(current.image_urls), ...uploadedUrls]),
      }));
      notify(`${uploadedUrls.length} vehicle ${uploadedUrls.length === 1 ? 'photo' : 'photos'} compressed and uploaded. Save the vehicle to publish.`, 'success');
    } catch (error) {
      notify(error?.message || 'Vehicle pictures could not be optimized and uploaded.');
    } finally {
      setImageUploadBusy(false);
    }
  }

  return <section className="content-grid vehicles-layout">
    <Panel title="Fleet" eyebrow="Vehicles">
      <div className="list-search-toolbar">
        <div className="search-row"><Search size={18}/><input value={vehicleSearch} maxLength="120" onChange={(event)=>setVehicleSearch(limitText(event.target.value, 120))} placeholder="Search name, plate, VIN, type, feature..." /></div>
        <span>{visibleVehicles.length} of {vehicles.length} vehicles</span>
        <button className="primary-btn add-vehicle-trigger" type="button" onClick={() => setAddVehicleOpen(true)}><Plus size={17}/> Add New Vehicle</button>
      </div>
      {visibleVehicles.length === 0 && <p className="muted list-empty-state">No vehicles match “{vehicleSearch.trim()}”.</p>}
      {visibleVehicles.map((v) => {
        const isSelected = selectedVehicle?.id === v.id;
        const vehicleSchedules = maintenanceSchedules.filter((schedule) => schedule.vehicle_id === v.id && schedule.active !== false);
        const scheduleStates = vehicleSchedules.map((schedule) => getMaintenanceScheduleState(schedule, v));
        const maintenance = scheduleStates.find((state) => state.due)
          || scheduleStates.find((state) => state.soon)
          || getVehicleMaintenanceState(v);
        const scheduleStatus = vehicleScheduleStatus(v.status);
        const conditionStatus = v.maintenance_lock_active ? 'maintenance' : operationalVehicleStatus(v.status);
        const statusUndo = vehicleStatusUndo[v.id];
        const canUndoStatus = Boolean(statusUndo
          && !scheduleStatus
          && !v.maintenance_lock_active
          && conditionStatus === statusUndo.nextStatus);
        const showMarkAvailable = conditionStatus === 'unavailable' && !scheduleStatus && !v.maintenance_lock_active;
        const showUndoStatus = canUndoStatus && !(showMarkAvailable && statusUndo.previousStatus === 'available');
        const vehicleImage = getAdminVehicleImage(v);
        return <div className={`data-row vehicle-list-row ${isSelected ? 'selected' : ''}`} role="button" tabIndex={0} key={v.id} onClick={() => selectVehicle(v)} onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') selectVehicle(v);
        }}>
          <div className="vehicle-card-identity">
            <div className={`vehicle-list-thumbnail-shell${vehicleImage ? '' : ' empty'}`}>
              {vehicleImage
                ? <img className="vehicle-list-thumbnail" src={vehicleImage} alt="" loading="lazy" decoding="async" />
                : <Car size={24} aria-hidden="true"/>}
            </div>
            <div className="vehicle-card-details">
              <strong>{v.name}</strong>
              <span>{v.brand} {v.model} • {v.vehicle_type}</span>
              <small>Plate: {v.plate_number || 'TBD'} • VIN: {v.vin || 'TBD'} • Mileage: {formatMiles(v.current_mileage)}</small>
              <small className={`maintenance-summary ${maintenance.due ? 'due' : maintenance.soon ? 'soon' : ''}`}>
                <Wrench size={13}/> {maintenance.label}
              </small>
            </div>
          </div>
          <div className="vehicle-card-price">
            <span className="vehicle-card-zone-label">Daily rate</span>
            <div className="vehicle-row-price">
              <strong>{money(v.daily_rate)}<span>/day</span></strong>
              <small>{money(v.security_deposit)} deposit</small>
            </div>
          </div>
          <div className="vehicle-card-status">
            <span className="vehicle-card-zone-label">Status</span>
            <div className="vehicle-row-state">
              <span className={`vehicle-publish-badge ${v.published === false ? 'unpublished' : 'published'}`}>{v.published === false ? 'Unpublished' : 'Published'}</span>
              <span className={`fleet-status-badge ${conditionStatus}`}>Condition: {v.maintenance_lock_active ? 'Maintenance' : operationalVehicleStatusLabel(v.status)}</span>
              {scheduleStatus && <span className={`fleet-status-badge ${scheduleStatus}`}>Schedule: {vehicleScheduleStatusLabel(scheduleStatus)}</span>}
            </div>
          </div>
          <div className="vehicle-card-manage">
            <span className="vehicle-card-zone-label">Manage</span>
            <div className="vehicle-row-controls">
              {scheduleStatus || v.maintenance_lock_active ? (
                <span className="system-owned-status">{v.maintenance_lock_active ? 'Condition locked by maintenance' : 'Schedule state is automatic'}</span>
              ) : (
                <div className="vehicle-condition-actions">
                  <label className="vehicle-status-control"><span>{vehicleActionBusy[`${v.id}:status`] ? 'Updating…' : 'Condition'}</span><select value={operationalVehicleStatus(v.status)} disabled={Boolean(vehicleActionBusy[`${v.id}:status`])} onClick={(event) => event.stopPropagation()} onChange={(e)=>runVehicleAction(v.id, 'status', () => changeVehicleCondition(v, e.target.value))}>{statusOptions.map(([key, label])=><option key={key} value={key}>{label}</option>)}</select></label>
                  {showMarkAvailable && <button className="vehicle-mark-available-btn" type="button" disabled={Boolean(vehicleActionBusy[`${v.id}:status`])} onClick={(event) => {
                    event.stopPropagation();
                    runVehicleAction(v.id, 'status', () => changeVehicleCondition(v, 'available'));
                  }}><CheckCircle2 size={15}/> Mark Available</button>}
                  {showUndoStatus && <button className="vehicle-undo-status-btn" type="button" disabled={Boolean(vehicleActionBusy[`${v.id}:status`])} onClick={(event) => {
                    event.stopPropagation();
                    runVehicleAction(v.id, 'status', () => undoVehicleCondition(v));
                  }}><History size={15}/> Undo</button>}
                </div>
              )}
              <button className="secondary-btn vehicle-edit-btn" type="button" onClick={(event) => {
                event.stopPropagation();
                openVehicleEditor(v);
              }}><Pencil size={15}/> Edit</button>
              <button className="secondary-btn vehicle-publish-btn" type="button" disabled={Boolean(vehicleActionBusy[`${v.id}:publish`])} onClick={(event) => {
                event.stopPropagation();
                runVehicleAction(v.id, 'publish', () => updateVehiclePublished(v.id, v.published === false));
              }}>{vehicleActionBusy[`${v.id}:publish`] ? 'Saving…' : v.published === false ? 'Publish' : 'Unpublish'}</button>
            </div>
          </div>
        </div>;
      })}
    </Panel>
    {addVehicleOpen && <div className="admin-modal-backdrop vehicle-editor-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) closeAddVehicle();
    }}>
      <div className="admin-modal vehicle-editor-modal add-vehicle-modal" role="dialog" aria-modal="true" aria-label="Add new vehicle">
        <div className="admin-modal-header">
          <Car size={22}/>
          <div>
            <strong>Add New Vehicle</strong>
            <span>Create the inventory record, upload pictures, and choose whether to publish it.</span>
          </div>
          <button className="vehicle-editor-close admin-close-button" type="button" onClick={closeAddVehicle} aria-label="Close add vehicle form"><X size={19}/></button>
        </div>
        <form className="portal-form vehicle-editor-scroll vehicle-detail-form" onSubmit={async (event) => {
          const created = await addVehicle(event);
          if (created) setAddVehicleOpen(false);
        }}>
        <section className="vehicle-form-card">
          <div className="vehicle-form-card-heading"><strong>Vehicle details</strong><span>Customer-facing identity and registration information.</span></div>
          <VehicleIdentityFields form={vehicleForm} onChange={update} />
        </section>
        <section className="vehicle-form-card">
          <div className="vehicle-form-card-heading"><strong>Pricing & operations</strong><span>Rental pricing, availability, mileage, and maintenance.</span></div>
          <VehicleOperationsFields form={vehicleForm} onChange={update} statusOptions={statusOptions} />
        </section>
        <section className="vehicle-form-card vehicle-description-card">
          <div className="vehicle-form-card-heading"><strong>Description</strong><span>Add useful customer-facing context or internal inventory notes.</span></div>
          <textarea placeholder="Describe the vehicle, condition, or important rental notes…" maxLength="600" value={vehicleForm.description} onChange={(e)=>update('description', e.target.value)} />
        </section>
        <VehicleFeatureChecklist value={vehicleForm.features} onChange={(value)=>update('features', value)} alwaysVisible prominent />
        <label className="vehicle-photo-upload">
          <span><ImagePlus size={18}/> {imageUploadBusy ? 'Compressing pictures…' : 'Add vehicle pictures'}</span>
          <input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={imageUploadBusy} onChange={(event) => {
            const files = Array.from(event.target.files || []);
            event.target.value = '';
            addUploadedVehicleImages(files, false);
          }} />
          <small>Upload up to {MAX_VEHICLE_IMAGES}. Every JPG, PNG, or WebP is resized and converted to WebP automatically.</small>
        </label>
        <VehiclePhotoManager
          vehicleName={vehicleForm.name || 'New vehicle'}
          value={vehicleForm.image_urls}
          onChange={(urls)=>update('image_urls', listToLines(urls))}
        />
        <details className="vehicle-url-editor">
          <summary>Advanced: edit picture URLs</summary>
          <textarea placeholder="Picture URLs, one per line" maxLength="8000" value={vehicleForm.image_urls} onChange={(e)=>update('image_urls', e.target.value)} />
        </details>
          <div className="modal-actions vehicle-editor-actions add-vehicle-actions">
            <button className="secondary-btn" type="button" onClick={closeAddVehicle}>Cancel</button>
            <button className="approve" type="submit"><Plus size={17}/> Add Vehicle</button>
          </div>
        </form>
      </div>
    </div>}
    {editingVehicle && editVehicleForm && <div className="admin-modal-backdrop vehicle-editor-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) cancelEditVehicle();
    }}>
      <div className="admin-modal vehicle-editor-modal" role="dialog" aria-modal="true" aria-label={`Edit ${editingVehicle.name}`}>
        <div className="admin-modal-header">
          <Car size={22}/>
          <div>
            <strong>Edit Vehicle</strong>
            <span>{editingVehicle.name} • pricing, pictures, features, and inventory details</span>
          </div>
          <button className="vehicle-editor-close admin-close-button" type="button" onClick={cancelEditVehicle} aria-label="Close vehicle editor"><X size={19}/></button>
        </div>
        <div className="vehicle-editor-scroll">
          <section className={`vehicle-editor-maintenance-callout ${editingVehicle.maintenance_lock_active ? 'locked' : ''}`} aria-label="Maintenance and service shortcut">
            <span className="vehicle-editor-maintenance-icon"><Wrench size={19}/></span>
            <div>
              <strong>Maintenance &amp; Service</strong>
              <span>{editingVehicle.maintenance_lock_active ? editingVehicle.maintenance_lock_reason || 'Required service needs attention.' : `Current odometer ${formatMiles(editingVehicle.current_mileage)}. Review service schedules and history in this window.`}</span>
            </div>
            <button type="button" className={editingVehicle.maintenance_lock_active ? 'reject' : 'secondary-btn'} onClick={() => document.getElementById(`vehicle-maintenance-${editingVehicle.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              <Wrench size={15}/> Go to maintenance
            </button>
          </section>
          <section className="vehicle-editor-media">
            <div className="vehicle-editor-section-heading">
              <div><strong>Vehicle pictures</strong><span>The first picture is featured. Upload a replacement, set it featured, then delete the old picture.</span></div>
              <span>{linesToList(editVehicleForm.image_urls).length}/{MAX_VEHICLE_IMAGES}</span>
            </div>
            <VehiclePhotoManager
              vehicleName={editVehicleForm.name || editingVehicle.name}
              value={editVehicleForm.image_urls}
              onChange={(urls)=>updateEdit('image_urls', listToLines(urls))}
            />
            <label className="vehicle-photo-upload compact">
              <span><ImagePlus size={18}/> {imageUploadBusy ? 'Compressing and uploading…' : 'Add more pictures'}</span>
              <input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={imageUploadBusy} onChange={(event) => {
                const files = Array.from(event.target.files || []);
                event.target.value = '';
                addUploadedVehicleImages(files, true);
              }} />
              <small>Every upload is automatically resized, compressed, and converted to WebP.</small>
            </label>
            <details className="vehicle-url-editor">
              <summary>Advanced: edit picture URLs</summary>
              <textarea placeholder="Picture URLs, one per line" maxLength="8000" value={editVehicleForm.image_urls} onChange={(e)=>updateEdit('image_urls', e.target.value)} />
            </details>
          </section>
          <div className="portal-form vehicle-detail-form">
            <section className="vehicle-form-card">
              <div className="vehicle-form-card-heading"><strong>Vehicle details</strong><span>Customer-facing identity and registration information.</span></div>
              <VehicleIdentityFields form={editVehicleForm} onChange={updateEdit} />
            </section>
            <section className="vehicle-form-card">
              <div className="vehicle-form-card-heading"><strong>Pricing & operations</strong><span>Rental pricing, availability, mileage, and maintenance.</span></div>
              <VehicleOperationsFields form={editVehicleForm} onChange={updateEdit} statusOptions={statusOptions} vehicle={editingVehicle} />
            </section>
            <section className="vehicle-form-card vehicle-description-card">
              <div className="vehicle-form-card-heading"><strong>Description</strong><span>Add useful customer-facing context or internal inventory notes.</span></div>
              <textarea placeholder="Describe the vehicle, condition, or important rental notes…" maxLength="600" value={editVehicleForm.description} onChange={(event)=>updateEdit('description', event.target.value)} />
            </section>
            <VehicleFeatureChecklist value={editVehicleForm.features} onChange={(value)=>updateEdit('features', value)} />
          </div>
          <section id={`vehicle-maintenance-${editingVehicle.id}`} className="vehicle-editor-maintenance-section" aria-label={`${editingVehicle.name} maintenance and service`}>
            <MaintenanceCommandCenter
              vehicle={editingVehicle}
              schedules={maintenanceSchedules.filter((schedule) => schedule.vehicle_id === editingVehicle.id)}
              serviceLogs={maintenanceServiceLogs.filter((log) => log.vehicle_id === editingVehicle.id)}
              completeMaintenanceSchedule={completeMaintenanceSchedule}
              saveMaintenanceSchedule={saveMaintenanceSchedule}
              overrideVehicleMaintenance={overrideVehicleMaintenance}
            />
          </section>
        </div>
        <div className="modal-actions vehicle-editor-actions">
          <button className="secondary-btn" type="button" onClick={cancelEditVehicle}>Cancel</button>
          <button className="reject" type="button" onClick={()=>deleteVehicle(editingVehicle.id)}><XCircle size={16}/> Delete</button>
          <button className="approve" type="button" onClick={()=>saveVehicleEdit(editingVehicle.id)}><CheckCircle2 size={16}/> Save Vehicle</button>
        </div>
      </div>
    </div>}
  </section>;
}

function MaintenanceCommandCenter({ vehicle, schedules, serviceLogs, completeMaintenanceSchedule, saveMaintenanceSchedule, overrideVehicleMaintenance }) {
  const [completionSchedule, setCompletionSchedule] = useState(null);
  const [completion, setCompletion] = useState({ mileage: '', completedAt: adminBookingDateOffset(0), notes: '' });
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideHours, setOverrideHours] = useState('24');
  const [busy, setBusy] = useState(false);
  const sortedSchedules = [...schedules].sort((a, b) => {
    const aState = getMaintenanceScheduleState(a, vehicle);
    const bState = getMaintenanceScheduleState(b, vehicle);
    return Number(bState.due) - Number(aState.due)
      || Number(bState.soon) - Number(aState.soon)
      || String(a.label).localeCompare(String(b.label));
  });

  function openCompletion(schedule) {
    setCompletionSchedule(schedule);
    setCompletion({
      mileage: String(vehicle.current_mileage ?? ''),
      completedAt: adminBookingDateOffset(0),
      notes: '',
    });
  }

  function openScheduleEditor(schedule) {
    setEditingSchedule({
      ...schedule,
      interval_miles: schedule.interval_miles ?? '',
      interval_months: schedule.interval_months ?? '',
      warning_miles: schedule.warning_miles ?? 0,
      warning_days: schedule.warning_days ?? 0,
      last_service_mileage: schedule.last_service_mileage ?? '',
      last_service_at: schedule.last_service_at || '',
    });
  }

  async function submitCompletion(event) {
    event.preventDefault();
    setBusy(true);
    const saved = await completeMaintenanceSchedule(completionSchedule, completion);
    setBusy(false);
    if (saved) setCompletionSchedule(null);
  }

  async function submitSchedule(event) {
    event.preventDefault();
    setBusy(true);
    const saved = await saveMaintenanceSchedule(editingSchedule, editingSchedule);
    setBusy(false);
    if (saved) setEditingSchedule(null);
  }

  async function submitOverride(event) {
    event.preventDefault();
    setBusy(true);
    const saved = await overrideVehicleMaintenance(vehicle, overrideReason, Number(overrideHours));
    setBusy(false);
    if (saved) {
      setOverrideOpen(false);
      setOverrideReason('');
    }
  }

  return <Panel title={`${vehicle.name} Maintenance`} eyebrow="Fleet Safety Command Center">
    <div className={`maintenance-lock-banner ${vehicle.maintenance_lock_active ? 'locked' : vehicle.maintenance_override_until && new Date(vehicle.maintenance_override_until) > new Date() ? 'overridden' : 'clear'}`}>
      {vehicle.maintenance_lock_active ? <AlertTriangle size={21}/> : <ShieldCheck size={21}/>}
      <div>
        <strong>{vehicle.maintenance_lock_active ? 'Automatically locked from new bookings' : vehicle.maintenance_override_until && new Date(vehicle.maintenance_override_until) > new Date() ? 'Temporary maintenance override active' : 'No active maintenance lock'}</strong>
        <span>{vehicle.maintenance_lock_active
          ? vehicle.maintenance_lock_reason || 'Required service is due.'
          : vehicle.maintenance_override_until && new Date(vehicle.maintenance_override_until) > new Date()
            ? `${vehicle.maintenance_override_reason || 'Admin override'} • expires ${new Date(vehicle.maintenance_override_until).toLocaleString()}`
            : `Current odometer ${formatMiles(vehicle.current_mileage)}. Every active milestone is enforced automatically.`}</span>
      </div>
      {vehicle.maintenance_lock_active && <button type="button" className="reject" onClick={() => setOverrideOpen(true)}>Emergency Override</button>}
    </div>

    <div className="maintenance-schedule-grid">
      {sortedSchedules.map((schedule) => {
        const state = getMaintenanceScheduleState(schedule, vehicle);
        return <article className={`maintenance-schedule-card ${state.due ? 'due' : state.soon ? 'soon' : ''} ${schedule.active === false ? 'inactive' : ''}`} key={schedule.id}>
          <header>
            <span className="maintenance-card-icon"><Wrench size={17}/></span>
            <div><strong>{schedule.label}</strong><small>{maintenanceIntervalLabel(schedule)}</small></div>
            <em>{state.due ? 'Due now' : state.soon ? 'Due soon' : schedule.active === false ? 'Paused' : 'On schedule'}</em>
          </header>
          <p>{state.label}</p>
          <dl>
            <div><dt>Last service</dt><dd>{schedule.last_service_mileage != null ? formatMiles(schedule.last_service_mileage) : 'Mileage not recorded'}{schedule.last_service_at ? ` • ${new Date(`${schedule.last_service_at}T12:00:00`).toLocaleDateString()}` : ''}</dd></div>
            <div><dt>Next milestone</dt><dd>{[schedule.next_due_mileage != null ? formatMiles(schedule.next_due_mileage) : '', schedule.next_due_at ? new Date(`${schedule.next_due_at}T12:00:00`).toLocaleDateString() : ''].filter(Boolean).join(' • ') || 'Not configured'}</dd></div>
          </dl>
          <footer>
            <button type="button" className="secondary-btn" onClick={() => openScheduleEditor(schedule)}><Pencil size={14}/> Configure</button>
            <button type="button" className="primary-btn" onClick={() => openCompletion(schedule)}><CheckCircle2 size={15}/> Record Service</button>
          </footer>
        </article>;
      })}
      {!sortedSchedules.length && <p className="muted">No maintenance milestones are installed for this vehicle yet.</p>}
    </div>

    <details className="maintenance-history">
      <summary>Service history ({serviceLogs.length})</summary>
      <div className="maintenance-history-list">
        {serviceLogs.slice(0, 20).map((log) => <article key={log.id}><div><strong>{prettyStatus(log.service_type)}</strong><span>{formatMiles(log.completed_mileage)} • {new Date(`${log.completed_at}T12:00:00`).toLocaleDateString()}</span></div><small>{log.notes || 'No service note'}</small></article>)}
        {!serviceLogs.length && <p className="muted">Completed services will appear here.</p>}
      </div>
    </details>

    {completionSchedule && <div className="admin-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && setCompletionSchedule(null)}>
      <form className="admin-modal maintenance-action-modal" onSubmit={submitCompletion}>
        <div className="admin-modal-header"><Wrench size={21}/><div><strong>Record {completionSchedule.label}</strong><span>Mileage is mandatory and recalculates the next milestone.</span></div><button type="button" className="vehicle-editor-close admin-close-button" onClick={() => setCompletionSchedule(null)} aria-label="Close maintenance completion"><X size={18}/></button></div>
        <div className="portal-form">
          <label><span>Service mileage</span><input required type="number" min={vehicle.current_mileage || 0} max={MILEAGE_MAX} step="1" value={completion.mileage} onChange={(event) => setCompletion({ ...completion, mileage: event.target.value })}/></label>
          <label><span>Service date</span><input required type="date" max={adminBookingDateOffset(0)} value={completion.completedAt} onChange={(event) => setCompletion({ ...completion, completedAt: event.target.value })}/></label>
          <label><span>Service notes / invoice reference</span><textarea maxLength="1000" value={completion.notes} onChange={(event) => setCompletion({ ...completion, notes: event.target.value })} placeholder="Work completed, shop, invoice number, parts used…"/></label>
        </div>
        <div className="modal-actions"><button type="button" className="secondary-btn" onClick={() => setCompletionSchedule(null)}>Cancel</button><button className="approve" disabled={busy}>{busy ? 'Recording…' : 'Complete Service'}</button></div>
      </form>
    </div>}

    {editingSchedule && <div className="admin-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && setEditingSchedule(null)}>
      <form className="admin-modal maintenance-action-modal" onSubmit={submitSchedule}>
        <div className="admin-modal-header"><Wrench size={21}/><div><strong>Configure {editingSchedule.label}</strong><span>OEM defaults can be adjusted for this exact vehicle and service history.</span></div><button type="button" className="vehicle-editor-close admin-close-button" onClick={() => setEditingSchedule(null)} aria-label="Close maintenance schedule"><X size={18}/></button></div>
        <div className="portal-form maintenance-config-form">
          <label><span>Milestone label</span><input required maxLength="80" value={editingSchedule.label} onChange={(event) => setEditingSchedule({ ...editingSchedule, label: event.target.value })}/></label>
          <div className="form-row">
            <label><span>Every miles</span><input type="number" min="500" max="300000" step="1" value={editingSchedule.interval_miles} onChange={(event) => setEditingSchedule({ ...editingSchedule, interval_miles: event.target.value })}/></label>
            <label><span>Every months</span><input type="number" min="1" max="240" step="1" value={editingSchedule.interval_months} onChange={(event) => setEditingSchedule({ ...editingSchedule, interval_months: event.target.value })}/></label>
          </div>
          <div className="form-row">
            <label><span>Warn this many miles early</span><input type="number" min="0" max="25000" step="1" value={editingSchedule.warning_miles} onChange={(event) => setEditingSchedule({ ...editingSchedule, warning_miles: event.target.value })}/></label>
            <label><span>Warn this many days early</span><input type="number" min="0" max="365" step="1" value={editingSchedule.warning_days} onChange={(event) => setEditingSchedule({ ...editingSchedule, warning_days: event.target.value })}/></label>
          </div>
          <div className="form-row">
            <label><span>Last service mileage</span><input type="number" min="0" max={MILEAGE_MAX} step="1" value={editingSchedule.last_service_mileage} onChange={(event) => setEditingSchedule({ ...editingSchedule, last_service_mileage: event.target.value })}/></label>
            <label><span>Last service date</span><input type="date" max={adminBookingDateOffset(0)} value={editingSchedule.last_service_at} onChange={(event) => setEditingSchedule({ ...editingSchedule, last_service_at: event.target.value })}/></label>
          </div>
          <label><span>Notes</span><textarea maxLength="1000" value={editingSchedule.notes || ''} onChange={(event) => setEditingSchedule({ ...editingSchedule, notes: event.target.value })}/></label>
          <div className="form-row compact">
            <label className="checkbox-pill"><input type="checkbox" checked={editingSchedule.lock_when_due !== false} onChange={(event) => setEditingSchedule({ ...editingSchedule, lock_when_due: event.target.checked })}/> Auto-lock when due</label>
            <label className="checkbox-pill"><input type="checkbox" checked={editingSchedule.active !== false} onChange={(event) => setEditingSchedule({ ...editingSchedule, active: event.target.checked })}/> Active milestone</label>
          </div>
        </div>
        <div className="modal-actions"><button type="button" className="secondary-btn" onClick={() => setEditingSchedule(null)}>Cancel</button><button className="approve" disabled={busy}>{busy ? 'Saving…' : 'Save Milestone'}</button></div>
      </form>
    </div>}

    {overrideOpen && <div className="admin-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && setOverrideOpen(false)}>
      <form className="admin-modal maintenance-action-modal" onSubmit={submitOverride}>
        <div className="admin-modal-header"><AlertTriangle size={21}/><div><strong>Override Maintenance Lock</strong><span>This is time-limited, audited, and sends an admin push alert.</span></div><button type="button" className="vehicle-editor-close admin-close-button" onClick={() => setOverrideOpen(false)} aria-label="Close maintenance override"><X size={18}/></button></div>
        <div className="portal-form">
          <label><span>Specific operational reason</span><textarea required minLength="10" maxLength="1000" value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Explain why this vehicle is safe to release before service…"/></label>
          <label><span>Override duration</span><select value={overrideHours} onChange={(event) => setOverrideHours(event.target.value)}><option value="4">4 hours</option><option value="12">12 hours</option><option value="24">24 hours</option><option value="48">48 hours</option><option value="72">72 hours</option><option value="168">7 days maximum</option></select></label>
        </div>
        <div className="modal-actions"><button type="button" className="secondary-btn" onClick={() => setOverrideOpen(false)}>Cancel</button><button className="reject" disabled={busy}>{busy ? 'Applying…' : 'Apply Audited Override'}</button></div>
      </form>
    </div>}
  </Panel>;
}

function VehiclePhotoManager({ vehicleName, value, onChange }) {
  const urls = linesToList(value);

  function makeFeatured(index) {
    if (index <= 0) return;
    const next = [...urls];
    const [featured] = next.splice(index, 1);
    next.unshift(featured);
    onChange(next);
  }

  function removePicture(index) {
    onChange(urls.filter((_, pictureIndex) => pictureIndex !== index));
  }

  if (!urls.length) {
    return <div className="vehicle-photo-empty"><ImagePlus size={22}/><span>No pictures yet. Add one below.</span></div>;
  }

  return <div className="vehicle-photo-grid">
    {urls.map((url, index) => <article className={`vehicle-photo-card ${index === 0 ? 'featured' : ''}`} key={`${url}-${index}`}>
      <div className="vehicle-photo-frame">
        <img src={url} alt={`${vehicleName} ${index === 0 ? 'featured' : `picture ${index + 1}`}`} loading="lazy" />
        {index === 0 && <span className="featured-photo-badge"><Star size={13} fill="currentColor"/> Featured</span>}
      </div>
      <div className="vehicle-photo-actions">
        {index !== 0 && <button type="button" onClick={() => makeFeatured(index)}><Star size={14}/> Set featured</button>}
        <button type="button" className="remove-photo" onClick={() => removePicture(index)}><Trash2 size={14}/> Delete from listing</button>
      </div>
    </article>)}
  </div>;
}

function VehicleFeatureChecklist({ value, onChange, initiallyOpen = false, prominent = false, alwaysVisible = false }) {
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const features = linesToList(value);
  const selected = new Set(features);
  const customFeatures = features.filter((feature) => !KNOWN_VEHICLE_FEATURES.has(feature));

  function emit(nextSelected, nextCustom = customFeatures) {
    const orderedKnown = VEHICLE_FEATURE_GROUPS
      .flatMap((group) => group.features)
      .filter((feature) => nextSelected.has(feature));
    onChange(listToLines([...orderedKnown, ...nextCustom]));
  }

  function toggle(feature, checked) {
    const next = new Set(selected);
    if (checked) next.add(feature);
    else next.delete(feature);
    emit(next);
  }

  const options = <>
    <div className="vehicle-feature-groups">
      {VEHICLE_FEATURE_GROUPS.map((group) => <section key={group.label}>
        <strong>{group.label}</strong>
        {group.features.map((feature) => <label className="vehicle-feature-option" key={feature}>
          <input type="checkbox" checked={selected.has(feature)} onChange={(event) => toggle(feature, event.target.checked)} />
          <span>{feature}</span>
        </label>)}
      </section>)}
    </div>
    <label className="field-label vehicle-custom-features">Add custom features
      <textarea placeholder="One per line, for example panoramic roof or premium sound" maxLength="800" value={listToLines(customFeatures)} onChange={(event) => emit(selected, linesToList(event.target.value))} />
    </label>
  </>;
  const heading = <><span><strong>Features &amp; equipment</strong><em>Check every feature customers should see on this vehicle.</em></span><small>{selected.size} selected</small></>;

  if (alwaysVisible) {
    return <div className="new-vehicle-feature-section" aria-label="Vehicle features and equipment">
      <div className="new-vehicle-feature-heading">{heading}</div>
      {options}
    </div>;
  }

  return <details className={`vehicle-feature-picker ${prominent ? 'prominent' : ''}`} open={isOpen} onToggle={(event) => setIsOpen(event.currentTarget.open)}>
    <summary>{heading}</summary>
    {options}
  </details>;
}

function Documents({ documents, markDocument, openDocument, deleteDocument }) {
  return <Panel title="Document Review" eyebrow="License & Insurance">
    <div className="table-list">
      {documents.length === 0 && <p className="muted">No document uploads yet.</p>}
      {documents.map((d) => <div className="data-row" key={d.id}>
        <div>
          <strong>{d.extension_request_id ? 'Extension Insurance' : docLabel(d.document_type)}</strong>
          <span>{d.profiles?.full_name || d.user_id}</span>
          <small>{d.rentals?.vehicles?.name || 'No vehicle'} • {new Date(d.created_at).toLocaleString()}</small>
        </div>
        <div className="row-actions">
          <em>{d.status}</em>
          <button onClick={()=>openDocument(d)}><FileText size={16}/> Open</button>
          <button onClick={()=>markDocument(d.id, 'approved')} className="approve"><CheckCircle2 size={16}/> Approve</button>
          <button onClick={()=>markDocument(d.id, 'rejected')} className="reject"><XCircle size={16}/> Reject</button>
          <button onClick={()=>deleteDocument(d)} className="reject"><XCircle size={16}/> Delete</button>
        </div>
      </div>)}
    </div>
  </Panel>;
}

function CommunicationsInbox({ rentals, messages, selectedRental, onSelectThread, replyText, setReplyText, sendReply }) {
  const [threadSearch, setThreadSearch] = useState('');
  const rentalsByCustomer = new Map();
  [...rentals].sort((a, b) => new Date(b.created_at || b.pickup_date || 0) - new Date(a.created_at || a.pickup_date || 0)).forEach((rental) => {
    if (!rentalsByCustomer.has(rental.user_id)) rentalsByCustomer.set(rental.user_id, rental);
  });
  const normalizedSearch = threadSearch.trim().toLowerCase();
  const threads = [...rentalsByCustomer.values()].map((rental) => {
    const customerMessages = messages.filter((message) => message.user_id === rental.user_id);
    const latestMessage = customerMessages[customerMessages.length - 1];
    const unread = customerMessages.filter((message) => message.sender_role !== 'admin' && !message.read_by_admin).length;
    return { rental, latestMessage, unread, messageCount: customerMessages.length };
  }).filter(({ rental, latestMessage, messageCount }) => messageCount > 0 && (!normalizedSearch || [rental.profiles?.full_name, rental.profiles?.email, rental.profiles?.phone, latestMessage?.message].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedSearch))))
    .sort((a, b) => new Date(b.latestMessage?.created_at || b.rental.created_at || 0) - new Date(a.latestMessage?.created_at || a.rental.created_at || 0));
  const threadMessages = selectedRental ? messages.filter((message) => message.user_id === selectedRental.user_id) : [];

  useEffect(() => {
    if (threads.length && !threads.some((thread) => thread.rental.user_id === selectedRental?.user_id)) onSelectThread?.(threads[0].rental);
  }, [threads[0]?.rental?.id, selectedRental?.user_id]);

  return <section className="communications-inbox">
    <Panel title="Customer Inbox" eyebrow={`${threads.reduce((sum, thread) => sum + thread.unread, 0)} Unread`}>
      <div className="search-row communications-thread-search"><Search size={17}/><input value={threadSearch} onChange={(event) => setThreadSearch(limitText(event.target.value, 120))} placeholder="Search conversations…" /></div>
      <div className="communications-thread-list">
        {threads.map(({ rental, latestMessage, unread }) => <button className={`communications-thread ${selectedRental?.user_id === rental.user_id ? 'active' : ''}`} key={rental.user_id} onClick={() => onSelectThread?.(rental)}>
          <span className="communications-thread-avatar">{String(rental.profiles?.full_name || 'C').charAt(0).toUpperCase()}</span>
          <span><strong>{rental.profiles?.full_name || rental.customer_name_snapshot || 'Customer'}</strong><small>{latestMessage?.message || 'No portal messages yet'}</small></span>
          <em>{unread > 0 ? unread : latestMessage?.created_at ? new Date(latestMessage.created_at).toLocaleDateString() : ''}</em>
        </button>)}
        {!threads.length && <p className="muted">No customer conversations match this search.</p>}
      </div>
    </Panel>
    <Panel title={selectedRental?.profiles?.full_name || selectedRental?.customer_name_snapshot || 'Select a customer'} eyebrow="Portal Conversation">
      <div className="communications-thread-context">{selectedRental ? <><span>{selectedRental.profiles?.email || selectedRental.customer_email_snapshot || 'No email saved'}</span><span>Latest rental: {selectedRental.vehicles?.name || 'Vehicle'} • {formatRentalDate(selectedRental.pickup_date, selectedRental.pickup_time)}</span></> : <span>Choose a conversation to read and reply.</span>}</div>
      <div className="message-box communications-message-box">
        {threadMessages.map((message) => <div key={message.id} className={message.sender_role === 'admin' ? 'message own' : 'message'}><strong>{message.sender_role === 'admin' ? 'Admin' : selectedRental?.profiles?.full_name || 'Customer'}</strong><p>{message.message}</p><span>{new Date(message.created_at).toLocaleString()}</span></div>)}
        {selectedRental && !threadMessages.length && <p className="muted communications-empty-thread">No portal messages yet. Use Contact Customer for a template-based email or text.</p>}
      </div>
      <form className="support-form" onSubmit={sendReply}><input value={replyText} maxLength="1000" disabled={!selectedRental} onChange={(event)=>setReplyText(limitText(event.target.value, 1000))} placeholder={selectedRental ? 'Write a portal reply…' : 'Select a customer first'}/><button disabled={!selectedRental || !replyText.trim()}><Send size={16}/> Send Reply</button></form>
    </Panel>
  </section>;
}

function ManualBooking({ manualBookingForm, setManualBookingForm, profiles, customerDirectoryState, refreshCustomerDirectory, vehicles, rentals, pendingBookings = [], availabilityBlocks, under25Pricing, serviceFees = [], bookingPolicy = DEFAULT_BOOKING_POLICY, createManualBooking, submitting }) {
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const update = (key, value) => setManualBookingForm((current) => ({ ...current, [key]: value }));
  const updateSchedule = (key, value) => setManualBookingForm((current) => {
    const next = { ...current, [key]: value, vehicleId: '' };
    if (key === 'pickupDate' || key === 'pickupTime') {
      const pickupAt = parseBookingDateTime(next.pickupDate, next.pickupTime);
      const returnAt = parseBookingDateTime(next.returnDate, next.returnTime);
      const minimumMilliseconds = Number(bookingPolicy.minimum_rental_days || 1) * 86400000;
      if (pickupAt && (!returnAt || returnAt.getTime() - pickupAt.getTime() < minimumMilliseconds)) {
        const earliestReturn = new Date(pickupAt.getTime() + minimumMilliseconds);
        next.returnDate = localDateInput(earliestReturn);
        next.returnTime = formatAdminTime(earliestReturn);
      }
    }
    return next;
  });
  const chooseCustomerMode = (customerMode) => {
    setCustomerSearch('');
    setCustomerDropdownOpen(false);
    setManualBookingForm((current) => ({
      ...current,
      customerMode,
      customerId: '',
      existingFirstName: '',
      existingLastName: '',
      existingDateOfBirth: '',
      existingPhone: '',
      driverLicenseNumber: '',
      driverLicenseState: '',
      insuranceProvider: '',
      insurancePolicyNumber: '',
    }));
  };
  const customers = [...profiles]
    .sort((a, b) => String(a.full_name || a.email || '').localeCompare(String(b.full_name || b.email || '')));
  const normalizedCustomerSearch = customerSearch.trim().toLowerCase();
  const customerSearchDigits = normalizedCustomerSearch.replace(/\D/g, '');
  const allMatchingCustomers = customers.filter((profile) => {
    if (!normalizedCustomerSearch) return true;
    const name = String(profile.full_name || '').toLowerCase();
    const email = String(profile.email || '').toLowerCase();
    const phone = String(profile.phone || '');
    return name.includes(normalizedCustomerSearch) || email.includes(normalizedCustomerSearch) || (customerSearchDigits && phone.replace(/\D/g, '').includes(customerSearchDigits));
  });
  const matchingCustomers = allMatchingCustomers.slice(0, 50);
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === manualBookingForm.vehicleId);
  const selectedCustomer = profiles.find((profile) => profile.id === manualBookingForm.customerId);
  const bookingWindow = getBookingWindow(manualBookingForm, bookingPolicy);
  const days = bookingWindow.billableDays;
  const reservationWindowReady = bookingWindow.valid;
  const reservationWindow = {
    pickupDate: manualBookingForm.pickupDate,
    pickupTime: manualBookingForm.pickupTime,
    returnDate: manualBookingForm.returnDate,
    returnTime: manualBookingForm.returnTime,
  };
  const activePendingHolds = pendingBookings
    .filter((booking) => booking.status === 'pending' && new Date(booking.expires_at).getTime() > Date.now())
    .map((booking) => ({ ...booking, status: 'checkout_hold' }));
  const vehicleChoices = vehicles.map((vehicle) => ({
    vehicle,
    availability: manualBookingVehicleAvailability(vehicle, reservationWindow, [...rentals, ...activePendingHolds], availabilityBlocks, reservationWindowReady),
  })).sort((a, b) => Number(b.availability.available) - Number(a.availability.available)
    || String(a.vehicle.name || '').localeCompare(String(b.vehicle.name || '')));
  const selectedVehicleAvailability = vehicleChoices.find((choice) => choice.vehicle.id === manualBookingForm.vehicleId)?.availability;
  const baseRentalTotal = Number(selectedVehicle?.daily_rate || 0) * days;
  const dateOfBirth = manualBookingForm.customerMode === 'new' ? manualBookingForm.dateOfBirth : selectedCustomer?.date_of_birth || manualBookingForm.existingDateOfBirth;
  const age = adminCustomerAge(dateOfBirth);
  const under25 = age !== null && age < 25;
  const markupPercentage = under25 ? Number(under25Pricing?.rental_markup_percentage || 0) : 0;
  const markupAmount = baseRentalTotal * markupPercentage / 100;
  const rentalTotal = baseRentalTotal + markupAmount;
  const serviceFeeTotal = serviceFees.reduce((sum, fee) => sum + Number(fee.amount || 0), 0);
  const taxableServiceFeeTotal = serviceFees.filter((fee) => fee.taxable).reduce((sum, fee) => sum + Number(fee.amount || 0), 0);
  const taxTotal = (rentalTotal + taxableServiceFeeTotal) * CT_TAX_RATE;
  const baseDeposit = Number(selectedVehicle?.security_deposit || 0);
  const deposit = under25 ? calculateAdminUnder25Deposit(baseDeposit, under25Pricing) : baseDeposit;
  const customerName = manualBookingForm.customerMode === 'new'
    ? joinLegalName(manualBookingForm.firstName, manualBookingForm.lastName) || 'New customer'
    : selectedCustomer?.full_name || selectedCustomer?.email || 'Choose a customer';

  return <section className="manual-booking-layout">
    <Panel title="Create a Booking" eyebrow="Admin Booking">
      <p className="muted">Choose an existing customer or add a new one, then select the car and exact pickup and return times.</p>
      <form className="portal-form manual-booking-form" onSubmit={createManualBooking}>
        <div className="booking-divider"><span>1. Customer</span></div>
        <div className="customer-mode-switch" role="group" aria-label="Customer type">
          <button type="button" className={manualBookingForm.customerMode === 'existing' ? 'active' : ''} onClick={() => chooseCustomerMode('existing')}><UserRound size={17}/> Existing customer</button>
          <button type="button" className={manualBookingForm.customerMode === 'new' ? 'active' : ''} onClick={() => chooseCustomerMode('new')}><Plus size={17}/> Add new customer</button>
        </div>

        {manualBookingForm.customerMode === 'existing' ? <div className="customer-combobox full-field">
          <div className="customer-directory-status">
            <span>{customerDirectoryState.loading ? 'Refreshing customer and administrator accounts…' : `${profiles.length} customer and administrator accounts loaded`}</span>
            <button type="button" onClick={refreshCustomerDirectory} disabled={customerDirectoryState.loading}>{customerDirectoryState.loading ? 'Refreshing…' : 'Refresh list'}</button>
          </div>
          {customerDirectoryState.error && <p className="form-error customer-directory-error" role="alert">Customer accounts could not refresh: {customerDirectoryState.error}</p>}
          <label htmlFor="manual-customer-search"><span>Customer</span></label>
          <div className="customer-search-input">
            <Search size={18}/>
            <input id="manual-customer-search" value={customerSearch} onFocus={() => setCustomerDropdownOpen(true)} onBlur={() => window.setTimeout(() => setCustomerDropdownOpen(false), 120)} onChange={(event) => {
              setCustomerSearch(limitText(event.target.value, 160));
              setCustomerDropdownOpen(true);
              setManualBookingForm((current) => ({ ...current, customerId: '', existingFirstName: '', existingLastName: '', existingDateOfBirth: '', existingPhone: '', driverLicenseNumber: '', driverLicenseState: '', insuranceProvider: '', insurancePolicyNumber: '' }));
            }} placeholder="Search name, email, or phone" autoComplete="off" role="combobox" aria-expanded={customerDropdownOpen} aria-controls="manual-customer-results" />
          </div>
          {customerDropdownOpen && <div className="customer-search-results" id="manual-customer-results" role="listbox">
            {matchingCustomers.length ? matchingCustomers.map((customer) => <button type="button" role="option" aria-selected={customer.id === manualBookingForm.customerId} key={customer.id} onMouseDown={(event) => event.preventDefault()} onClick={() => {
              setCustomerSearch(customer.full_name || customer.email || customer.phone || 'Customer');
              setCustomerDropdownOpen(false);
            setManualBookingForm((current) => ({
              ...current,
              customerId: customer.id,
              existingFirstName: '',
              existingLastName: '',
              existingDateOfBirth: customer?.date_of_birth || '',
              existingPhone: customer?.phone || '',
              driverLicenseNumber: customer?.drivers_license_number || '',
              driverLicenseState: customer?.drivers_license_state || '',
              insuranceProvider: customer?.insurance_provider || '',
              insurancePolicyNumber: customer?.insurance_policy_number || '',
            }));
            }}><strong>{customer.full_name || 'Unnamed customer'}{String(customer.role || '').toLowerCase() === 'admin' ? ' • Administrator' : ''}</strong><span>{[customer.email, customer.phone].filter(Boolean).join(' • ') || 'No email or phone saved'}</span></button>) : <p>{customerDirectoryState.loading ? 'Loading customer accounts…' : 'No customers match that search.'}</p>}
            {allMatchingCustomers.length > matchingCustomers.length && <p>Showing the first 50 matches. Type more of the name, email, or phone number to narrow the list.</p>}
          </div>}
          {selectedCustomer && <div className="selected-customer-confirmation"><CheckCircle2 size={17}/><span><strong>Selected:</strong> {selectedCustomer.full_name || selectedCustomer.email || selectedCustomer.phone}<small>{selectedCustomer.email || 'Email missing'} • {selectedCustomer.phone || 'Phone missing'} • {selectedCustomer.phone_verified ? 'Phone verified' : 'Phone verification needed'} • {String(selectedCustomer.identity_verification_status || '').toLowerCase() === 'verified' ? 'Identity verified' : 'Identity verification needed'}</small></span></div>}
          {selectedCustomer && !selectedCustomer.full_name?.trim() && <div className="existing-customer-legal-name full-field">
            <label className="admin-legal-name-field"><span>First name</span><input value={manualBookingForm.existingFirstName} onChange={(event) => update('existingFirstName', limitText(event.target.value, 80))} autoComplete="given-name" placeholder="First name + middle name or initial" required /><small>Include the middle name or initial exactly as shown on the customer’s ID.</small></label>
            <label className="admin-legal-name-field"><span>Last name</span><input value={manualBookingForm.existingLastName} onChange={(event) => update('existingLastName', limitText(event.target.value, 80))} autoComplete="family-name" placeholder="Last name exactly as shown on ID" required /><small>This legal name will be saved to the selected customer profile.</small></label>
            <div className="admin-legal-name-notice full-field" role="note"><AlertTriangle size={17}/><span><strong>This profile currently has only an email.</strong> Entering the legal name here permanently attaches it to the customer before the rental is created.</span></div>
          </div>}
          {selectedCustomer && <label className="full-field"><span>Mobile number for secure texts</span><input type="tel" value={manualBookingForm.existingPhone} onChange={(event) => update('existingPhone', limitText(event.target.value, 32))} autoComplete="tel" placeholder="(860) 555-0123" /><small>{isValidUSPhone(manualBookingForm.existingPhone) ? 'Ready for SMS delivery. The customer must still verify this number personally.' : 'Enter 10 US digits to send the secure booking link by text.'}</small></label>}
        </div> : <div className="new-customer-fields">
          <label className="admin-legal-name-field"><span>First name</span><input value={manualBookingForm.firstName} onChange={(event) => update('firstName', limitText(event.target.value, 80))} autoComplete="given-name" placeholder="First name + middle name or initial" required /><small>Put the customer’s middle name or initial in this field exactly as shown on their ID.</small></label>
          <label className="admin-legal-name-field"><span>Last name</span><input value={manualBookingForm.lastName} onChange={(event) => update('lastName', limitText(event.target.value, 80))} autoComplete="family-name" placeholder="Last name exactly as shown on ID" required /><small>Use the customer’s legal last name exactly as shown on their ID.</small></label>
          <div className="admin-legal-name-notice full-field" role="note"><AlertTriangle size={17}/><span><strong>Match the customer’s ID exactly.</strong> If the ID shows a middle name or initial, enter it immediately after the first name. Stripe Identity may reject a missing or mismatched name.</span></div>
          <label><span>Email</span><input type="email" value={manualBookingForm.email} onChange={(event) => update('email', limitText(event.target.value, 200))} autoComplete="email" placeholder="customer@email.com" required /></label>
          <label><span>Phone</span><input type="tel" value={manualBookingForm.phone} onChange={(event) => update('phone', limitText(event.target.value, 32))} autoComplete="tel" placeholder="(860) 555-0123" required /></label>
          <AdminBirthdayInput idPrefix="new-customer-birthday" value={manualBookingForm.dateOfBirth} onChange={(value) => update('dateOfBirth', value)} />
          <label className="full-field"><span>Address (optional)</span><input value={manualBookingForm.address} onChange={(event) => update('address', limitText(event.target.value, 240))} autoComplete="street-address" placeholder="Street, city, state, ZIP" /></label>
          <p className="customer-save-note full-field"><ShieldCheck size={16}/> The customer will receive the selected vehicle and dates, then enter this email to begin the full guided verification checklist.</p>
        </div>}
        {manualBookingForm.customerMode === 'existing' && selectedCustomer && !selectedCustomer.date_of_birth && <div className="full-field missing-dob-field"><AdminBirthdayInput idPrefix="existing-customer-birthday" value={manualBookingForm.existingDateOfBirth} onChange={(value) => update('existingDateOfBirth', value)} /></div>}

        <details className="optional-record-details full-field">
          <summary>2. Optional saved license &amp; insurance details</summary>
          <p>These notes do not replace the required document uploads or admin approval.</p>
          <div className="optional-record-fields">
          <label><span>Driver license number</span><input value={manualBookingForm.driverLicenseNumber} onChange={(event) => update('driverLicenseNumber', limitText(event.target.value, 64))} placeholder="License number" autoComplete="off" /></label>
          <label><span>License state</span><input value={manualBookingForm.driverLicenseState} onChange={(event) => update('driverLicenseState', limitText(event.target.value.toUpperCase(), 32))} placeholder="CT" autoComplete="off" /></label>
          <label><span>Insurance company</span><input value={manualBookingForm.insuranceProvider} onChange={(event) => update('insuranceProvider', limitText(event.target.value, 120))} placeholder="Insurance provider" autoComplete="organization" /></label>
          <label><span>Insurance policy number</span><input value={manualBookingForm.insurancePolicyNumber} onChange={(event) => update('insurancePolicyNumber', limitText(event.target.value, 120))} placeholder="Policy number" autoComplete="off" /></label>
          </div>
        </details>

        <div className="booking-divider"><span>3. Reservation</span></div>
        <label><span>Pickup date</span><input type="date" min={adminBookingDateOffset(0)} value={manualBookingForm.pickupDate} onChange={(event) => updateSchedule('pickupDate', event.target.value)} required /></label>
        <label><span>Pickup time</span><select value={manualBookingForm.pickupTime} onChange={(event) => updateSchedule('pickupTime', event.target.value)}>{calendarTimeOptions(manualBookingForm.pickupTime).map((time) => <option key={time} value={time}>{time}</option>)}</select></label>
        <label><span>Return date</span><input type="date" min={manualBookingForm.pickupDate || undefined} value={manualBookingForm.returnDate} onChange={(event) => updateSchedule('returnDate', event.target.value)} required /></label>
        <label><span>Return time</span><select value={manualBookingForm.returnTime} onChange={(event) => updateSchedule('returnTime', event.target.value)}>{calendarTimeOptions(manualBookingForm.returnTime).map((time) => <option key={time} value={time}>{time}</option>)}</select></label>
        <p className={`booking-policy-message full-field ${bookingWindow.valid ? 'valid' : 'invalid'}`}><Clock size={17}/><span>{bookingWindow.valid ? `${formatAdminDuration(bookingWindow.actualMinutes)} rental · ${days} daily rate${days === 1 ? '' : 's'}.` : bookingWindow.error}</span></p>
        <label className="full-field vehicle-availability-field"><span>Vehicle availability</span><select value={manualBookingForm.vehicleId} onChange={(event) => update('vehicleId', event.target.value)} disabled={!reservationWindowReady} required><option value="">{reservationWindowReady ? 'Choose an available vehicle' : 'Choose pickup and return dates first'}</option>{vehicleChoices.map(({ vehicle, availability }) => <option key={vehicle.id} value={vehicle.id} disabled={!availability.available}>{availability.available ? '✓ Available' : '✕ Unavailable'} — {vehicle.name} — {money(vehicle.daily_rate)}/day{!availability.available ? ` — ${availability.reason}` : ''}</option>)}</select></label>
        <div className="booking-divider"><span>4. Next steps &amp; payment plan</span></div>
        <label className="full-field"><span>Send the customer’s guided completion link</span><select value={manualBookingForm.onboardingDelivery} onChange={(event) => update('onboardingDelivery', event.target.value)}><option value="both">Email + text guided link (recommended)</option><option value="text">Text guided link only</option><option value="email">Email guided link only</option><option value="none">Do not send yet — I will send it later</option></select></label>
        <label className="full-field"><span>How will payment be collected?</span><select value={manualBookingForm.paymentCollectionPreference} onChange={(event) => update('paymentCollectionPreference', event.target.value)}><option value="customer_link">Customer pays through the secure link (recommended)</option><option value="admin_stripe">Admin opens Stripe Checkout on this device</option><option value="external">Admin records payment received outside Stripe</option><option value="later">Decide later</option></select></label>
        {manualBookingForm.paymentCollectionPreference === 'admin_stripe' && <p className="payment-plan-note full-field"><CreditCard size={17}/><span>Open the <strong>Payment</strong> circle after creating the booking, then launch secure Stripe Checkout on this device. Card details stay in Stripe and are never entered into this portal.</span></p>}
        {manualBookingForm.paymentCollectionPreference === 'external' && <p className="payment-plan-note full-field"><DollarSign size={17}/><span>Open the <strong>Payment</strong> circle and use <strong>Record phone / external payment</strong> only after the exact amount has actually cleared.</span></p>}
        <p className="customer-save-note full-field"><ShieldCheck size={17}/><span>{manualBookingForm.customerMode === 'existing'
          ? 'Returning-customer path: the link asks for the account email. Verified phone, successful Stripe Identity, and an approved driver license are reused automatically; only missing or rental-specific steps remain.'
          : 'New-customer path: the link asks for the booking email, then guides the customer through phone, Stripe Identity, driver license, insurance, agreement, and payment.'}</span></p>
        {reservationWindowReady && <div className="vehicle-availability-legend full-field"><span className="available"><CheckCircle2 size={16}/> Available for these exact times</span><span className="unavailable"><XCircle size={16}/> Unavailable vehicles are blocked</span></div>}
        {selectedVehicleAvailability && !selectedVehicleAvailability.available && <div className="vehicle-selection-warning full-field"><AlertTriangle size={17}/>{selectedVehicleAvailability.reason}</div>}
        <button className="primary-btn full-field" disabled={submitting || !bookingWindow.valid || !selectedVehicle || !selectedVehicleAvailability?.available}><CalendarClock size={17}/> {submitting ? 'Creating booking…' : manualBookingForm.onboardingDelivery === 'none' ? 'Create Booking' : 'Create Booking & Send Next Steps'}</button>
      </form>
    </Panel>

    <div className="manual-booking-sidebar">
      <aside className="booking-summary-card">
        <p className="eyebrow">Booking Summary</p>
        <h3>{customerName}</h3>
        <dl>
          <div><dt>Vehicle</dt><dd>{selectedVehicle?.name || 'Not selected'}</dd></div>
          <div><dt>Duration</dt><dd>{bookingWindow.valid ? `${formatAdminDuration(bookingWindow.actualMinutes)} · ${days} billed day${days === 1 ? '' : 's'}` : 'Choose valid times'}</dd></div>
          <div><dt>Base rental</dt><dd>{money(baseRentalTotal)}</dd></div>
          {under25 && markupAmount > 0 && <div><dt>Under-25 markup ({markupPercentage}%)</dt><dd>{money(markupAmount)}</dd></div>}
          <div><dt>Rental total</dt><dd>{money(rentalTotal)}</dd></div>
          {serviceFeeTotal > 0 && <div><dt>Booking fees</dt><dd>{money(serviceFeeTotal)}</dd></div>}
          <div><dt>CT tax</dt><dd>{money(taxTotal)}</dd></div>
          <div><dt>Deposit</dt><dd>{selectedVehicle ? money(deposit) : '—'}</dd></div>
          <div><dt>Total due</dt><dd>{selectedVehicle ? money(rentalTotal + serviceFeeTotal + taxTotal + deposit) : '—'}</dd></div>
        </dl>
        {under25 && <div className="underage-deposit-note"><ShieldCheck size={17}/><span>Under 25: {money(deposit)} refundable deposit and {markupPercentage}% rental markup</span></div>}
        <p className="summary-note">{manualPaymentPreferenceSummary(manualBookingForm.paymentCollectionPreference)}</p>
      </aside>
      <InsuranceLinksPanel/>
    </div>
  </section>;
}

function AdminQuickLinks() {
  return <details className="admin-quick-links">
    <summary><ExternalLink size={16}/><span>Quick Links</span><ChevronDown className="quick-links-chevron" size={16}/></summary>
    <div className="quick-links-dropdown">
      {ADMIN_QUICK_LINK_GROUPS.map((group) => <section key={group.label}>
        <h4>{group.label}</h4>
        <div>{group.links.map((link) => <a key={`${group.label}-${link.label}`} href={link.href} target="_blank" rel="noopener noreferrer"><span>{link.label}</span><ExternalLink size={14}/></a>)}</div>
      </section>)}
    </div>
  </details>;
}

function MobileAdminQuickLinks() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const closeRef = useRef(null);
  const sheetRef = useRef(null);

  function closeSheet() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function handleSheetKeyDown(event) {
    if (event.key !== 'Tab') return;
    const focusable = [...(sheetRef.current?.querySelectorAll('button:not([disabled]), a[href]') || [])];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeSheet();
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const sheet = open ? createPortal(<>
    <button type="button" className="mobile-quick-links-scrim" aria-label="Close Quick Links" onClick={closeSheet}/>
    <section
      ref={sheetRef}
      id="mobile-quick-links-sheet"
      className="mobile-quick-links-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-quick-links-title"
      onKeyDown={handleSheetKeyDown}
    >
      <header className="mobile-quick-links-heading">
        <div><p>Shortcuts</p><h2 id="mobile-quick-links-title">Quick Links</h2></div>
        <button ref={closeRef} className="admin-close-button" type="button" aria-label="Close Quick Links" onClick={closeSheet}><X size={22}/></button>
      </header>
      <div className="mobile-quick-links-content">
        {ADMIN_QUICK_LINK_GROUPS.map((group) => <section key={group.label}>
          <h3>{group.label}</h3>
          <div>{group.links.map((link) => <a key={`${group.label}-${link.label}`} href={link.href} target="_blank" rel="noopener noreferrer" onClick={closeSheet}><span>{link.label}</span><ExternalLink size={18}/></a>)}</div>
        </section>)}
      </div>
    </section>
  </>, document.body) : null;

  return <div className="mobile-admin-quick-links">
    <button
      ref={triggerRef}
      type="button"
      className="mobile-quick-links-trigger"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls="mobile-quick-links-sheet"
      onClick={() => setOpen(true)}
    >
      Quick Links
    </button>
    {sheet}
  </div>;
}

function InsuranceLinksPanel() {
  return <aside className="insurance-links-card">
    <div className="insurance-links-heading"><ShieldCheck size={19}/><div><p className="eyebrow">Insurance Resources</p><h3>Coverage Links</h3></div></div>
    <p className="muted">Open coverage options for the customer without leaving the booking form.</p>
    <div className="insurance-resource-list">
      {INSURANCE_RESOURCE_LINKS.map((link) => <a key={link.label} className={link.recommended ? 'recommended' : ''} href={link.href} target="_blank" rel="noopener noreferrer">
        <span><strong>{link.label}</strong><small>{link.detail}</small></span>
        {link.recommended && <em>Recommended</em>}
        <ExternalLink size={16}/>
      </a>)}
    </div>
    <small className="insurance-links-disclaimer">Third-party coverage terms and eligibility are controlled by each provider.</small>
  </aside>;
}

function SettingsTab({
  discountCodes,
  discountForm,
  setDiscountForm,
  generateDiscountCode,
  copyDiscountCode,
  createDiscountCode,
  toggleDiscountCode,
  deleteDiscountCode,
  sitePromotions,
  promotionForm,
  setPromotionForm,
  editingPromotionId,
  saveSitePromotion,
  editSitePromotion,
  resetPromotionForm,
  toggleSitePromotion,
  deleteSitePromotion,
  serviceFees,
  serviceFeeForm,
  setServiceFeeForm,
  createServiceFee,
  toggleServiceFee,
  deleteServiceFee,
  under25Pricing,
  setUnder25Pricing,
  saveUnder25Pricing,
  removeUnder25DepositAdjustment,
  under25PricingSaving,
  billingAutomation,
  setBillingAutomation,
  saveBillingAutomation,
  billingAutomationSaving,
  bookingPolicy,
  setBookingPolicy,
  saveBookingPolicy,
  bookingPolicySaving,
  availabilityTypes,
  updateAvailabilityType,
}) {
  const [settingsSection, setSettingsSection] = useState('pricing');
  const effectiveBookingProvider = 'supabase';
  const advanceNoticeMinutes = Number(bookingPolicy.advance_notice_minutes || 0);
  const advanceNoticeUnit = advanceNoticeMinutes === 0 ? 'immediate' : advanceNoticeMinutes % 1440 === 0 ? 'days' : 'hours';
  const advanceNoticeValue = advanceNoticeUnit === 'days' ? advanceNoticeMinutes / 1440 : advanceNoticeUnit === 'hours' ? advanceNoticeMinutes / 60 : 0;
  const setAdvanceNoticeUnit = (unit) => setBookingPolicy((current) => ({
    ...current,
    advance_notice_minutes: unit === 'immediate' ? 0 : unit === 'days' ? 1440 : 60,
  }));
  const setAdvanceNoticeValue = (value) => setBookingPolicy((current) => ({
    ...current,
    advance_notice_minutes: Math.max(0, Number(value) || 0) * (advanceNoticeUnit === 'days' ? 1440 : 60),
  }));
  const updateDiscount = (key, value) => setDiscountForm({ ...discountForm, [key]: key === 'code' ? normalizeCodeInput(value) : value });
  const updateFee = (key, value) => {
    const normalizedValue = key === 'name' ? limitText(value, 60)
      : key === 'service_type' ? limitText(value, 32)
      : key === 'description' ? limitText(value, 240)
      : value;
    setServiceFeeForm({ ...serviceFeeForm, [key]: normalizedValue });
  };
  const updatePromotion = (key, value) => setPromotionForm((current) => ({ ...current, [key]: value }));
  const togglePromotionPage = (surface, page, checked) => {
    const key = `${surface}_pages`;
    setPromotionForm((current) => ({
      ...current,
      [key]: checked
        ? [...new Set([...current[key], page])]
        : current[key].filter((item) => item !== page),
    }));
  };

  return <section className="settings-grid">
    <div className="settings-workspace-nav">
      <div><p className="eyebrow">Configuration</p><h2>Settings</h2><span>Choose the area you need instead of scanning every business control at once.</span></div>
      <div className="filter-pills" role="tablist" aria-label="Settings area">
        {[['pricing', 'Pricing & Billing'], ['marketing', 'Marketing'], ['fleet', 'Fleet Configuration']].map(([key, label]) => <button type="button" role="tab" aria-selected={settingsSection === key} key={key} className={settingsSection === key ? 'active' : ''} onClick={() => setSettingsSection(key)}>{label}</button>)}
      </div>
    </div>

    {settingsSection === 'pricing' && <Panel title="Booking Rules" eyebrow="Reservation Timing">
      <p className="muted">Same-day pickup is allowed. These rules control the minimum trip length and how far ahead every new booking must be created.</p>
      <form className="portal-form settings-form booking-policy-form" onSubmit={saveBookingPolicy}>
        <label>
          <span>Minimum rental duration</span>
          <div className="booking-policy-inline-control">
            <input type="number" min="1" max="30" step="1" value={bookingPolicy.minimum_rental_days ?? 1} onChange={(event) => setBookingPolicy((current) => ({ ...current, minimum_rental_days: event.target.value }))} />
            <strong>day(s)</strong>
          </div>
          <small>One day means 24 actual hours. A 9:00 AM pickup cannot return before 9:00 AM the following day.</small>
        </label>
        <label>
          <span>Admin-created unpaid booking deadline</span>
          <div className="booking-policy-inline-control">
            <input type="number" min="5" max="10080" step="5" value={bookingPolicy.admin_booking_payment_deadline_minutes ?? 60} onChange={(event) => setBookingPolicy((current) => ({ ...current, admin_booking_payment_deadline_minutes: event.target.value }))} />
            <strong>minutes</strong>
          </div>
          <small>New unpaid bookings created by staff auto-cancel after this many minutes. You can still change an individual open booking’s deadline.</small>
        </label>
        <div className="form-row">
          <label>
            <span>Minimum advance notice</span>
            <select value={advanceNoticeUnit} onChange={(event) => setAdvanceNoticeUnit(event.target.value)}>
              <option value="immediate">Immediately</option>
              <option value="hours">Hours ahead</option>
              <option value="days">Days ahead</option>
            </select>
          </label>
          {advanceNoticeUnit !== 'immediate' && <label>
            <span>Advance notice ({advanceNoticeUnit})</span>
            <input type="number" min="1" max={advanceNoticeUnit === 'days' ? 365 : 8760} step="1" value={advanceNoticeValue} onChange={(event) => setAdvanceNoticeValue(event.target.value)} />
          </label>}
        </div>
        <div className="booking-policy-preview">
          <CheckCircle2 size={18}/>
          <span><strong>{Number(bookingPolicy.minimum_rental_days || 1) * 24}-hour minimum.</strong> {advanceNoticeMinutes === 0 ? 'Customers can choose the next available same-day pickup time.' : `Pickup must be booked ${formatAdminDuration(advanceNoticeMinutes)} ahead.`}</span>
        </div>
        <button className="primary-btn" disabled={bookingPolicySaving}>{bookingPolicySaving ? 'Saving…' : 'Save Booking Rules'}</button>
      </form>
    </Panel>}

    {settingsSection === 'pricing' && <Panel title="Billing Automation" eyebrow="Hands-Off Operations">
      <p className="muted">TollSpot enrolls every real fleet vehicle, polls for tolls, matches each toll to its vehicle and rental, and adds the customer charge automatically. Only ambiguous provider records need admin review.</p>
      <form className="portal-form settings-form" onSubmit={saveBillingAutomation}>
        <label className="checkbox-pill">
          <input type="checkbox" checked={billingAutomation.tollspot_automatic_sync_enabled !== false} onChange={(event) => setBillingAutomation((current) => ({ ...current, tollspot_automatic_sync_enabled: event.target.checked }))} />
          Fetch TollSpot activity automatically
        </label>
        <div className="automation-lock-note"><CheckCircle2 size={17}/><span><strong>Automatic toll charges are always on.</strong> Exact matches become rental charges; questionable matches stay in the Tolls review queue.</span></div>
        <label className="checkbox-pill">
          <input type="checkbox" checked={billingAutomation.automatic_deposit_release_enabled !== false} onChange={(event) => setBillingAutomation((current) => ({ ...current, automatic_deposit_release_enabled: event.target.checked }))} />
          Automatically refund clean-return deposits
        </label>
        <label>
          <span>Wait after return before automatic refund</span>
          <input type="number" min="1" max="30" step="1" value={billingAutomation.deposit_release_delay_days ?? 7} disabled={billingAutomation.automatic_deposit_release_enabled === false} onChange={(event) => setBillingAutomation((current) => ({ ...current, deposit_release_delay_days: event.target.value }))} />
          <small>Unpaid tolls, late fees, damage, cleaning, and other rental charges always block the refund, even after this delay.</small>
        </label>
        <button className="primary-btn" disabled={billingAutomationSaving}>{billingAutomationSaving ? 'Saving…' : 'Save Billing Automation'}</button>
      </form>
    </Panel>}

    {settingsSection === 'pricing' && <div className="under25-settings-panel">
      <Panel title="Under-25 Pricing" eyebrow="Age-Based Pricing">
        <p className="muted">These adjustments apply on top of each vehicle’s own daily rate and refundable deposit. Changes apply to newly priced rentals; paid rentals keep their captured terms.</p>
        <form className="portal-form settings-form" onSubmit={saveUnder25Pricing}>
          <label className="checkbox-pill">
            <input type="checkbox" checked={under25Pricing.deposit_adjustment_enabled !== false} onChange={(event) => setUnder25Pricing((current) => ({ ...current, deposit_adjustment_enabled: event.target.checked }))} />
            Add an under-25 deposit adjustment
          </label>
          <div className="form-row">
            <label>
              <span>Deposit adjustment type</span>
              <select disabled={under25Pricing.deposit_adjustment_enabled === false} value={under25Pricing.deposit_adjustment_type || 'fixed'} onChange={(event) => setUnder25Pricing((current) => ({ ...current, deposit_adjustment_type: event.target.value }))}>
                <option value="fixed">Fixed dollar amount</option>
                <option value="percentage">Percentage of vehicle deposit</option>
              </select>
            </label>
            <label>
              <span>{under25Pricing.deposit_adjustment_type === 'percentage' ? 'Deposit increase percentage' : 'Deposit increase amount'}</span>
              <input disabled={under25Pricing.deposit_adjustment_enabled === false} type="number" min="0" max={under25Pricing.deposit_adjustment_type === 'percentage' ? 100 : MONEY_MAX} step="0.01" inputMode="decimal" value={under25Pricing.deposit_adjustment_value ?? 0} onChange={(event) => setUnder25Pricing((current) => ({ ...current, deposit_adjustment_value: event.target.value }))} />
            </label>
          </div>
          <label>
            <span>Under-25 rental markup percentage</span>
            <input type="number" min="0" max="100" step="0.01" inputMode="decimal" value={under25Pricing.rental_markup_percentage ?? 0} onChange={(event) => setUnder25Pricing((current) => ({ ...current, rental_markup_percentage: event.target.value }))} />
            <small>Example: 10 adds 10% to the rental subtotal before Connecticut sales tax.</small>
          </label>
          <div className="under25-pricing-preview">
            {[300, 400, 500].map((deposit) => <span key={deposit}><strong>{money(deposit)} vehicle deposit</strong> → {money(calculateAdminUnder25Deposit(deposit, under25Pricing))} under 25</span>)}
          </div>
          <div className="button-row">
            <button className="primary-btn" disabled={under25PricingSaving}>{under25PricingSaving ? 'Saving…' : 'Save Under-25 Pricing'}</button>
            <button type="button" className="reject" disabled={under25PricingSaving || under25Pricing.deposit_adjustment_enabled === false} onClick={removeUnder25DepositAdjustment}>Remove Deposit Adjustment</button>
          </div>
        </form>
      </Panel>
    </div>}

    {settingsSection === 'marketing' && <div className="promotion-settings-panel">
      <Panel title="Website Promotion Manager" eyebrow="Advertising">
        <p className="muted promotion-manager-intro">Create one campaign, write the popup and banner messages, choose where each appears, and schedule when both automatically disappear. The coupon buttons keep the same tap-to-copy action used on the current website.</p>
        <form className="portal-form settings-form promotion-form" onSubmit={saveSitePromotion}>
          <div className="promotion-form-section">
            <h4>Campaign and coupon</h4>
            <div className="form-row">
              <label><span>Campaign name (admin only)</span><input required maxLength="80" placeholder="Labor Day Special" value={promotionForm.name} onChange={(event) => updatePromotion('name', limitText(event.target.value, 80))} /></label>
              <label><span>Saved discount code</span><select required value={promotionForm.coupon_code} onChange={(event) => {
                const code = discountCodes.find((item) => item.code === event.target.value);
                setPromotionForm((current) => ({ ...current, coupon_code: event.target.value, discount_code_id: code?.id || null }));
              }}><option value="">Choose a code</option>{discountCodes.map((code) => <option value={code.code} disabled={!code.active} key={code.id}>{code.code} — {discountLabel(code)}{code.active ? '' : ' (paused)'}</option>)}</select></label>
            </div>
            {promotionForm.coupon_code && <button type="button" className="secondary-btn promotion-copy-code" onClick={() => copyDiscountCode(promotionForm.coupon_code)}><Copy size={15}/> Copy code for banner or popup</button>}
            <div className="form-row promotion-three-column">
              <label><span>Banner badge</span><input maxLength="32" placeholder="20% OFF" value={promotionForm.badge_text} onChange={(event) => updatePromotion('badge_text', limitText(event.target.value, 32))} /></label>
              <label><span>Large offer</span><input maxLength="20" placeholder="20%" value={promotionForm.offer_value} onChange={(event) => updatePromotion('offer_value', limitText(event.target.value, 20))} /></label>
              <label><span>Offer suffix</span><input maxLength="20" placeholder="off" value={promotionForm.offer_suffix} onChange={(event) => updatePromotion('offer_suffix', limitText(event.target.value, 20))} /></label>
            </div>
            <div className="form-row">
              <label><span>Starts (Eastern Time)</span><input type="datetime-local" value={promotionForm.starts_at} onChange={(event) => updatePromotion('starts_at', event.target.value)} /></label>
              <label><span>Ends and auto-hides (Eastern Time)</span><input required type="datetime-local" value={promotionForm.ends_at} onChange={(event) => updatePromotion('ends_at', event.target.value)} /></label>
            </div>
          </div>

          <div className="promotion-surface-grid">
            <section className={`promotion-surface-card ${promotionForm.popup_enabled ? 'enabled' : ''}`}>
              <div className="promotion-surface-heading">
                <div><strong>Popup</strong><small>Uses the homepage popup layout and countdown.</small></div>
                <label className="checkbox-pill"><input type="checkbox" checked={promotionForm.popup_enabled} onChange={(event) => updatePromotion('popup_enabled', event.target.checked)} /> Show popup</label>
              </div>
              <label><span>Small heading</span><input disabled={!promotionForm.popup_enabled} maxLength="60" value={promotionForm.popup_kicker} onChange={(event) => updatePromotion('popup_kicker', limitText(event.target.value, 60))} /></label>
              <label><span>Popup headline</span><input disabled={!promotionForm.popup_enabled} required={promotionForm.popup_enabled} maxLength="120" placeholder="Your holiday ride just got better." value={promotionForm.popup_title} onChange={(event) => updatePromotion('popup_title', limitText(event.target.value, 120))} /></label>
              <label><span>Popup message</span><textarea disabled={!promotionForm.popup_enabled} required={promotionForm.popup_enabled} maxLength="280" placeholder="Book before the deadline and use this code at checkout." value={promotionForm.popup_body} onChange={(event) => updatePromotion('popup_body', limitText(event.target.value, 280))} /></label>
              <fieldset className="promotion-page-picker" disabled={!promotionForm.popup_enabled}>
                <legend>Put popup on</legend>
                {SITE_PAGE_OPTIONS.map((page) => <label className="checkbox-pill" key={`popup-${page.value}`}><input type="checkbox" checked={promotionForm.popup_pages.includes(page.value)} onChange={(event) => togglePromotionPage('popup', page.value, event.target.checked)} /> {page.label}</label>)}
              </fieldset>
            </section>

            <section className={`promotion-surface-card ${promotionForm.banner_enabled ? 'enabled' : ''}`}>
              <div className="promotion-surface-heading">
                <div><strong>Banner</strong><small>Uses the cars-page banner layout and countdown.</small></div>
                <label className="checkbox-pill"><input type="checkbox" checked={promotionForm.banner_enabled} onChange={(event) => updatePromotion('banner_enabled', event.target.checked)} /> Show banner</label>
              </div>
              <label><span>Banner headline</span><input disabled={!promotionForm.banner_enabled} required={promotionForm.banner_enabled} maxLength="120" placeholder="Holiday special ends Monday at midnight" value={promotionForm.banner_title} onChange={(event) => updatePromotion('banner_title', limitText(event.target.value, 120))} /></label>
              <label><span>Banner supporting text</span><input disabled={!promotionForm.banner_enabled} maxLength="120" placeholder="Use code" value={promotionForm.banner_body} onChange={(event) => updatePromotion('banner_body', limitText(event.target.value, 120))} /></label>
              <fieldset className="promotion-page-picker" disabled={!promotionForm.banner_enabled}>
                <legend>Put banner on</legend>
                {SITE_PAGE_OPTIONS.map((page) => <label className="checkbox-pill" key={`banner-${page.value}`}><input type="checkbox" checked={promotionForm.banner_pages.includes(page.value)} onChange={(event) => togglePromotionPage('banner', page.value, event.target.checked)} /> {page.label}</label>)}
              </fieldset>
            </section>
          </div>

          <div className="promotion-form-section">
            <h4>Popup button and terms</h4>
            <div className="form-row">
              <label><span>Button label</span><input maxLength="60" value={promotionForm.cta_label} onChange={(event) => updatePromotion('cta_label', limitText(event.target.value, 60))} /></label>
              <label><span>Button destination</span><input maxLength="300" placeholder="cars-2.html" value={promotionForm.cta_url} onChange={(event) => updatePromotion('cta_url', limitText(event.target.value, 300))} /></label>
            </div>
            <label><span>Fine print (optional)</span><textarea maxLength="300" placeholder="Leave blank to show an automatically formatted ending time." value={promotionForm.fine_print} onChange={(event) => updatePromotion('fine_print', limitText(event.target.value, 300))} /></label>
            <label className="checkbox-pill promotion-active-toggle"><input type="checkbox" checked={promotionForm.active} onChange={(event) => updatePromotion('active', event.target.checked)} /> Publish this promotion when its schedule begins</label>
          </div>

          <div className="promotion-form-actions">
            <button className="primary-btn"><Tag size={17}/> {editingPromotionId ? 'Save Promotion Changes' : 'Create Promotion'}</button>
            {editingPromotionId && <button type="button" className="secondary-btn" onClick={resetPromotionForm}>Cancel Editing</button>}
          </div>
        </form>

        <div className="settings-list promotion-list">
          {sitePromotions.length === 0 && <p className="muted">No promotions yet. Run the site promotions Supabase migration if this is your first time using the manager.</p>}
          {sitePromotions.map((promotion) => <div className="data-row settings-row promotion-row" key={promotion.id}>
            <div>
              <strong>{promotion.name}</strong>
              <span>{promotion.coupon_code} • {promotionPlacementLabel(promotion)}</span>
              <small>{promotionScheduleLabel(promotion)}</small>
            </div>
            <div className="row-actions">
              <em className={promotionDisplayStatus(promotion) === 'Live' ? 'active-status' : 'paused-status'}>{promotionDisplayStatus(promotion)}</em>
              <button type="button" onClick={() => editSitePromotion(promotion)}><Pencil size={15}/> Edit</button>
              <button type="button" onClick={() => toggleSitePromotion(promotion.id, !promotion.active)}>{promotion.active ? 'Pause' : 'Activate'}</button>
              <button type="button" className="reject" onClick={() => deleteSitePromotion(promotion.id)}><XCircle size={16}/> Delete</button>
            </div>
          </div>)}
        </div>
      </Panel>
    </div>}

    {settingsSection === 'pricing' && <Panel title="Discount Codes" eyebrow="Pricing">
      <form className="portal-form settings-form" onSubmit={createDiscountCode}>
        <div className="form-row">
          <input placeholder="Code e.g. SUMMER25" maxLength="24" pattern="[A-Z0-9-]{3,24}" title="Discount code: 3-24 characters, uppercase letters, numbers, and hyphens only." value={discountForm.code} onChange={(event) => updateDiscount('code', event.target.value)} />
          <button type="button" className="secondary-btn" onClick={generateDiscountCode}><Tag size={16}/> Generate &amp; Copy</button>
        </div>
        <div className="form-row">
          <select value={discountForm.discount_type} onChange={(event) => updateDiscount('discount_type', event.target.value)}>
            <option value="percentage">Percentage off</option>
            <option value="fixed">Dollar amount off</option>
          </select>
          <input type="number" step="0.01" min="0.01" max={discountForm.discount_type === 'percentage' ? 100 : MONEY_MAX} inputMode="decimal" placeholder={discountForm.discount_type === 'percentage' ? '0-100%' : '$0.00'} title={discountForm.discount_type === 'percentage' ? 'Percentage discount from 0.01 to 100.' : 'Dollar discount in USD.'} value={discountForm.amount} onChange={(event) => updateDiscount('amount', event.target.value)} />
        </div>
        <div className="form-row">
          <input type="number" min="1" max="10000" step="1" inputMode="numeric" placeholder="Max uses optional" title="Whole-number redemption limit, max 10,000." value={discountForm.max_redemptions} onChange={(event) => updateDiscount('max_redemptions', event.target.value)} />
          <label className="checkbox-pill"><input type="checkbox" checked={discountForm.active} onChange={(event) => updateDiscount('active', event.target.checked)} /> Active</label>
        </div>
        <label className="checkbox-pill deposit-waiver-option">
          <input type="checkbox" checked={discountForm.waive_security_deposit} onChange={(event) => updateDiscount('waive_security_deposit', event.target.checked)} />
          <span><strong>Waive security deposit</strong><small>Admin-only. A 100% code with this enabled covers the entire checkout total, including fees, tax, and deposit.</small></span>
        </label>
        <div className="form-row">
          <label className="date-field"><span>Starts</span><input type="date" value={discountForm.starts_at} onChange={(event) => updateDiscount('starts_at', event.target.value)} /></label>
          <label className="date-field"><span>Expires</span><input type="date" value={discountForm.expires_at} onChange={(event) => updateDiscount('expires_at', event.target.value)} /></label>
        </div>
        <button className="primary-btn"><Plus size={17}/> Create Discount Code</button>
      </form>

      <div className="settings-list">
        {discountCodes.length === 0 && <p className="muted">No discount codes yet.</p>}
        {discountCodes.map((code) => <div className="data-row settings-row" key={code.id}>
          <div>
            <strong>{code.code}</strong>
            <span>{discountLabel(code)}{code.waive_security_deposit ? ' • Security deposit waived' : ''} • {code.max_redemptions ? `${code.redemption_count || 0}/${code.max_redemptions} used` : `${code.redemption_count || 0} used`}</span>
            <small>{code.starts_at ? `Starts ${formatDateOnly(code.starts_at)}` : 'Starts now'} • {code.expires_at ? `Expires ${formatDateOnly(code.expires_at)}` : 'No expiration'}</small>
          </div>
          <div className="row-actions">
            <em className={code.active ? 'active-status' : 'paused-status'}>{code.active ? 'Active' : 'Paused'}</em>
            <button onClick={() => toggleDiscountCode(code.id, !code.active)}>{code.active ? 'Pause' : 'Activate'}</button>
            <button type="button" onClick={() => copyDiscountCode(code.code)}><Copy size={15}/> Copy</button>
            <button className="reject" onClick={() => deleteDiscountCode(code.id)}><XCircle size={16}/> Delete</button>
          </div>
        </div>)}
      </div>
    </Panel>}

    {settingsSection === 'fleet' && <Panel title="Live Booking Page" eyebrow="Website Routing">
      <div className="booking-route-settings">
        <div className="booking-route-status">
          <span>Live now</span>
          <strong>{bookingProviderLabel(effectiveBookingProvider)}</strong>
          <small>{bookingProviderPath(effectiveBookingProvider)}</small>
        </div>
        <p className="muted">Cars-2 is the permanent customer booking page. Legacy customer pages and provider switching are disabled.</p>
        <div className="booking-route-preview-links">
          <a href="https://rentmect.com/cars-2.html" target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/> Open live booking page</a>
        </div>
      </div>
    </Panel>}

    {settingsSection === 'fleet' && <Panel title="Calendar Status Colors" eyebrow="Source of Truth">
      <p className="muted">Colors change presentation only. Reserved, On the Road, and Extension Hold are generated automatically; admins can create only Admin Hold, Unavailable, or Maintenance blocks.</p>
      <div className="identifier-settings">
        {Object.entries(availabilityTypes).map(([key, type]) => (
          <div className="identifier-row" key={key}>
            <span className="identifier-swatch" style={{ backgroundColor: type.color }} />
            <div>
              <strong>{type.label}</strong>
              <small>{SYSTEM_CALENDAR_DISPLAY_KEYS.includes(key)
                ? 'System-generated schedule state. Display color only.'
                : key === 'available'
                  ? 'Clear Manual Block action. Never clears system records.'
                  : 'Admin-controlled calendar block. Display color only.'}</small>
            </div>
            <input type="color" value={type.color} onChange={(event) => updateAvailabilityType(key, 'color', event.target.value)} aria-label={`${key} color`} />
          </div>
        ))}
      </div>
    </Panel>}

    {settingsSection === 'pricing' && <Panel title="Custom Fees" eyebrow="Pricing">
      <form className="portal-form settings-form" onSubmit={createServiceFee}>
        <input placeholder="Fee name e.g. Gas refill, late return, delivery, cleaning" maxLength="60" value={serviceFeeForm.name} onChange={(event) => updateFee('name', event.target.value)} />
        <div className="form-row">
          <input placeholder="Fee type e.g. gas, late_return, pickup, delivery" maxLength="32" title="Internal fee type, 32 characters max." value={serviceFeeForm.service_type} onChange={(event) => updateFee('service_type', event.target.value)} />
          <input type="number" step="0.01" min="0.01" max={MONEY_MAX} inputMode="decimal" placeholder="$0.00" title="Fee amount in USD." value={serviceFeeForm.amount} onFocus={(event) => event.target.select()} onBlur={() => updateFee('amount', formatDecimalInput(serviceFeeForm.amount))} onChange={(event) => updateFee('amount', event.target.value)} />
        </div>
        <textarea placeholder="Optional note for the admin and customer checkout display" maxLength="240" value={serviceFeeForm.description} onChange={(event) => updateFee('description', event.target.value)} />
        <div className="form-row compact">
          <label className="checkbox-pill"><input type="checkbox" checked={serviceFeeForm.taxable} onChange={(event) => updateFee('taxable', event.target.checked)} /> Taxable</label>
          <label className="checkbox-pill"><input type="checkbox" checked={serviceFeeForm.active} onChange={(event) => updateFee('active', event.target.checked)} /> Active</label>
        </div>
        <button className="primary-btn"><Plus size={17}/> Add Service Fee</button>
      </form>

      <div className="settings-list">
        {serviceFees.length === 0 && <p className="muted">No custom fees yet.</p>}
        {serviceFees.map((fee) => <div className="data-row settings-row" key={fee.id}>
          <div>
            <strong>{fee.name}</strong>
            <span>{prettyStatus(fee.service_type)} • {money(fee.amount)} {fee.taxable ? 'taxable' : 'not taxable'}</span>
            {fee.description && <small>{fee.description}</small>}
          </div>
          <div className="row-actions">
            <em className={fee.active ? 'active-status' : 'paused-status'}>{fee.active ? 'Active' : 'Paused'}</em>
            <button onClick={() => toggleServiceFee(fee.id, !fee.active)}>{fee.active ? 'Pause' : 'Activate'}</button>
            <button className="reject" onClick={() => deleteServiceFee(fee.id)}><XCircle size={16}/> Delete</button>
          </div>
        </div>)}
      </div>
    </Panel>}
  </section>;
}

function ReturnMonitorRow({ rental, sendManualReminder }) {
  const today = isToday(rental.return_date);
  const returnState = getLateReturnState(rental.return_date, rental.return_time, rental.status);
  const overdue = returnState.overdue;

  return <div className={`data-row return-monitor-row ${today ? 'due-today' : ''} ${overdue ? 'overdue' : ''}`}>
    <div>
      <strong>{rental.profiles?.full_name || rental.user_email || 'Client'}</strong>
      <span>{rental.vehicles?.name || 'Vehicle'}</span>
      <small>Return {formatRentalDate(rental.return_date, rental.return_time)}</small>
      {returnState.inGrace && <small>Three-hour grace ends {returnState.graceEnds.toLocaleString()}</small>}
      {returnState.hardLocked && <small>Inventory hard-locked until physical return and inspection.</small>}
    </div>
    <div className="row-actions">
      {today && <em className="due-pill">Due Today</em>}
      {returnState.inGrace && <em className="due-pill">3-Hour Grace</em>}
      {overdue && <em className="overdue-pill">Hard Locked</em>}
      <em>{prettyStatus(rental.status)}</em>
      <ReminderMenu rental={rental} sendManualReminder={sendManualReminder} />
    </div>
  </div>;
}

function RentalRow({ rental, updateRentalStatus, updateRentalPaymentDeadline, completeRentalReturn, releaseSecurityDeposit, refundRentalPayment, rentalRefunds = [], recordLocalDepositRelease, depositAllocations = [], recordTestPayment, recordExtensionPayment, cancelApprovedExtension, extensionRequests = [], emergencyExceptions = [], emergencyAuthorized, activateRentalWithEmergencyException, addEmergencyExceptionScope, resolveEmergencyExceptionScope, vehicles = [], reports = [], decideExtension, sendManualReminder, detailed, rentalDocuments = [], allDocuments = [], openDocument, markDocument, deleteDocument, rentalCharges = [], addRentalCharge, waiveRentalCharge, chargeRentalSavedCard, previewRentalAmendment, applyRentalAmendment, emailTemplates = [], smsTemplates = [], notify, sendBookingCompletionLink, uploadAdminBookingDocument, createAdminPaymentLink, stepCompletions = [], completeAdminRentalStep, signAdminRentalAgreement }) {
  const [returnPanelOpen, setReturnPanelOpen] = useState(() => readActiveReturnRentalId() === rental.id);
  const [externalPaymentModalOpen, setExternalPaymentModalOpen] = useState(false);
  const [pickupModal, setPickupModal] = useState(null);
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
  const [emergencyStepScope, setEmergencyStepScope] = useState('');
  const [adminStepScope, setAdminStepScope] = useState('');
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [editRentalOpen, setEditRentalOpen] = useState(false);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [contactModal, setContactModal] = useState(null);
  const [deadlineModalOpen, setDeadlineModalOpen] = useState(false);
  const reusableLicense = latestCustomerDocument(allDocuments, rental.user_id, 'license');
  const rentalLicense = rentalDocuments.find((d) => d.document_type === 'license');
  const license = rentalLicense || reusableLicense;
  const insurance = rentalDocuments.find((d) => d.document_type === 'insurance');
  const documentsForProgress = license && !rentalDocuments.some((document) => document.id === license.id)
    ? [license, ...rentalDocuments]
    : rentalDocuments;
  const documentsForDisplay = detailed && license && !rentalDocuments.some((document) => document.id === license.id)
    ? [license, ...rentalDocuments]
    : rentalDocuments;
  const returnState = getLateReturnState(rental.return_date, rental.return_time, rental.status);
  const canCompleteReturn = Boolean(completeRentalReturn) && ['active', 'overdue', 'return_initiated'].includes(rental.status);
  const releaseChecklist = getReleaseChecklist(rental, documentsForProgress);
  const activeEmergencyException = ['completed', 'cancelled'].includes(String(rental.status || '').toLowerCase())
    ? undefined
    : emergencyExceptions.find((item) => item.status === 'active' && new Date(item.expires_at).getTime() > Date.now());
  const emergencyScopeSet = getActiveEmergencyScopeSet(activeEmergencyException);
  const completionScopeSet = new Set(stepCompletions.map((item) => item.step_key));
  const effectiveReleaseChecklist = getEffectiveReleaseChecklist(releaseChecklist, new Set([...emergencyScopeSet, ...completionScopeSet]));
  const canRecordExternalPayment = rental.payment_status !== 'paid';
  const canMarkActive = effectiveReleaseChecklist.ready && !['active', 'overdue', 'return_initiated', 'completed', 'cancelled'].includes(rental.status);
  const canCancel = ['pending', 'documents_needed', 'document_review', 'ready_for_pickup', 'approved'].includes(rental.status);
  const canAdjustPaymentDeadline = rental.payment_status !== 'paid' && canCancel;
  const canCreateEmergencyException = Boolean(emergencyAuthorized)
    && !activeEmergencyException
    && !releaseChecklist.ready
    && ['pending', 'documents_needed', 'document_review', 'approved', 'ready_for_pickup'].includes(rental.status);
  const progressSteps = getRentalProgressSteps(rental, documentsForProgress, emergencyScopeSet, completionScopeSet);
  const rentalExtensions = extensionRequests.filter((request) => request.rental_id === rental.id || request.rentals?.id === rental.id);
  const rentalReports = reports.filter((report) => report.rental_id === rental.id || report.rentals?.id === rental.id);
  const adminState = getAdminRentalState(rental, effectiveReleaseChecklist);
  const defaultPickupMileage = rental?.starting_mileage ?? rental?.vehicles?.current_mileage ?? '';
  const outstandingRentalCharges = rentalCharges
    .filter((charge) => !charge.included_in_initial_payment && ['pending', 'checkout_open', 'failed'].includes(charge.status))
    .reduce((sum, charge) => sum + Number(charge.total_amount || 0), 0);
  const canReleaseDeposit = Boolean(releaseSecurityDeposit)
    && rental.status === 'completed'
    && ['held', 'adjustment_refund_due'].includes(rental.deposit_status)
    && Number(rental.deposit_held_amount || rental.security_deposit || 0) > 0
    && outstandingRentalCharges <= 0.005;
  const hasStripeDepositAllocation = depositAllocations.some((item) =>
    item.payment_provider === 'stripe' && ['held', 'refund_due_inspection', 'failed'].includes(item.status)
  ) || (depositAllocations.length === 0 && rental.payment_provider === 'stripe');
  const hasLocalDepositAllocation = depositAllocations.some((item) =>
    item.payment_provider === 'local' && ['held', 'refund_due_inspection', 'failed'].includes(item.status)
  ) || (depositAllocations.length === 0 && rental.payment_provider === 'local');
  const recordedRentalRefunds = rentalRefunds
    .filter((refund) => !['failed', 'cancelled'].includes(String(refund.status || '').toLowerCase()))
    .reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
  const releasedDeposit = Number(rental.deposit_released_amount || 0);
  const allocatedProtectedDeposit = depositAllocations
    .filter((allocation) =>
      allocation.payment_provider === 'stripe' &&
      !['released'].includes(String(allocation.status || '').toLowerCase())
    )
    .reduce((sum, allocation) =>
      sum + Math.max(0, Number(allocation.amount_held || 0) - Number(allocation.amount_released || 0)), 0);
  const fallbackProtectedDeposit = ['held', 'adjustment_refund_due', 'release_pending', 'transferred']
    .includes(String(rental.deposit_status || '').toLowerCase())
    ? Number(rental.deposit_held_amount || rental.security_deposit || 0)
    : 0;
  const protectedDeposit = allocatedProtectedDeposit || fallbackProtectedDeposit;
  const capturedPayment = Number(rental.payment_amount_cents || 0) > 0
    ? Number(rental.payment_amount_cents) / 100
    : Number(rental.rental_total || 0) + Number(rental.service_fee_total || 0) + Number(rental.tax_amount || 0) + Number(rental.security_deposit || 0);
  const refundableRentalPayment = Math.max(0, capturedPayment - recordedRentalRefunds - releasedDeposit - protectedDeposit);
  const canRefundRentalPayment = Boolean(refundRentalPayment)
    && rental.payment_provider === 'stripe'
    && rental.payment_status === 'paid'
    && refundableRentalPayment >= 0.5;

  function submitPickupOverride(startingMileage) {
    updateRentalStatus(rental.id, 'active', {
      startingMileage,
    });
    setPickupModal(null);
  }

  function openReturnPanel() {
    setActiveReturnRentalId(rental.id);
    setReturnPanelOpen(true);
  }

  function closeReturnPanel() {
    clearReturnDraft(rental.id);
    setReturnPanelOpen(false);
  }

  return <div className="data-row rental-row">
    <div className="rental-row-main">
      <strong>{rental.vehicles?.name || 'Vehicle'}</strong>
      <span>{rental.profiles?.full_name || rental.customer_name_snapshot || (rental.customer_auth_deleted_at ? 'Archived customer' : 'Customer record unavailable')} • {formatRentalDate(rental.pickup_date, rental.pickup_time)} → {formatRentalDate(rental.return_date, rental.return_time)}</span>
      {detailed && rental.customer_auth_deleted_at && <small className="archived-customer-note"><AlertTriangle size={14}/> Auth account deleted {new Date(rental.customer_auth_deleted_at).toLocaleDateString()}; rental retained as an auditable business record.</small>}
      {detailed && <small>{money(rental.rental_total)} rental • {money(rental.service_fee_total || 0)} booking fees • {money(rental.tax_amount)} tax • {money(rental.security_deposit)} deposit {rental.is_mock ? '• MOCK' : ''}</small>}
      {detailed && rental.payment_status !== 'paid' && rental.payment_due_at && <small className={`payment-deadline ${new Date(rental.payment_due_at).getTime() <= Date.now() ? 'expired' : ''}`}>
        <Clock size={14}/> Payment due {new Date(rental.payment_due_at).toLocaleString()} • unpaid booking auto-cancels at this deadline
      </small>}
      {detailed && canAdjustPaymentDeadline && <button type="button" className="adjust-payment-deadline-button" onClick={() => setDeadlineModalOpen(true)}><CalendarClock size={15}/> Change this reservation deadline</button>}
      {detailed && returnState.inGrace && <small className="late-return-warning"><Clock size={14}/> Three-hour grace is active. It ends {returnState.graceEnds.toLocaleString()}; the vehicle will then be hard-locked until inspection.</small>}
      {detailed && returnState.hardLocked && <small className="late-return-critical"><AlertTriangle size={14}/> PHYSICAL RETURN LOCK — this vehicle cannot accept another booking until the return inspection below is completed.</small>}
      {detailed && Number(rental.under_25_markup_amount || 0) > 0 && <small>Under-25 pricing: {money(rental.base_rental_total)} base + {money(rental.under_25_markup_amount)} ({Number(rental.under_25_markup_percentage || 0)}%) markup • {money(rental.base_security_deposit)} vehicle deposit adjusted to {money(rental.security_deposit)}</small>}
      {detailed && <small>Intended use: {rental.profiles?.intended_vehicle_use || 'Not provided'}</small>}
      {detailed && <DepositReleaseStatus rental={rental} />}
      {detailed && <MileageSummary rental={rental} />}
      {(activeEmergencyException || stepCompletions.length > 0) && <div className="admin-completion-badges">
        {stepCompletions.map((completion) => <span className="admin-completion-badge" key={completion.id}><CheckCircle2 size={13}/> {prettyStatus(completion.step_key)} completed by admin</span>)}
        {activeEmergencyException && <span className="admin-completion-badge warning"><AlertTriangle size={13}/> Legacy exception logged</span>}
      </div>}
      <RentalProgressTracker
        steps={progressSteps}
        onStepClick={(step) => setAdminStepScope(step.key)}
      />
      {progressSteps.some((step) => step.adminAction) && <small className="document-step-hint"><CheckCircle2 size={13}/> Click any booking circle to review it, upload documents, sign in office, collect payment, or mark that step complete.</small>}
      {detailed && <div className="rental-doc-summary">
        <DocumentStatusBadge label="License" document={license} />
        <DocumentStatusBadge label="Insurance" document={insurance} />
      </div>}
      {detailed && <DocumentMiniList documents={documentsForDisplay} openDocument={openDocument} markDocument={markDocument} deleteDocument={deleteDocument} />}
      {detailed && <RentalExtensionActions requests={rentalExtensions} documents={rentalDocuments} vehicles={vehicles} decideExtension={decideExtension} recordExtensionPayment={recordExtensionPayment} cancelApprovedExtension={cancelApprovedExtension} sendExtensionPaymentLink={(extension) => setContactModal({ extension })} openDocument={openDocument} markDocument={markDocument} />}
      {detailed && <RentalChargeManager rental={rental} charges={rentalCharges} addRentalCharge={addRentalCharge} waiveRentalCharge={waiveRentalCharge} chargeRentalSavedCard={chargeRentalSavedCard} sendPaymentLink={(charge) => setContactModal({ charge })} />}
      {detailed && outstandingRentalCharges > 0 && ['held', 'adjustment_refund_due'].includes(rental.deposit_status) && <div className="deposit-charge-block"><AlertTriangle size={16}/><span><strong>{money(outstandingRentalCharges)} must be collected or waived before the deposit can be refunded.</strong> Use Charge customer below; the refund action unlocks automatically when the balance is clear.</span></div>}
      {detailed && rentalReports.length > 0 && <DamageReportList reports={rentalReports} />}
      {!canMarkActive && !canCompleteReturn && <small className="next-action-hint">{adminState.next}</small>}
      {returnPanelOpen && <ReturnCompletionPanel rental={rental} onCancel={closeReturnPanel} onComplete={(inspection) => completeRentalReturn(rental, inspection)} />}
      {externalPaymentModalOpen && <ExternalPaymentModal
        rental={rental}
        onCancel={() => setExternalPaymentModalOpen(false)}
        onConfirm={async (payment) => {
          const recorded = await recordTestPayment?.(rental, payment);
          if (recorded) setExternalPaymentModalOpen(false);
          return recorded;
        }}
      />}
      {pickupModal && <PickupOverrideModal
        rental={rental}
        defaultMileage={defaultPickupMileage}
        missingRequirements={[]}
        override={false}
        onCancel={() => setPickupModal(null)}
        onConfirm={submitPickupOverride}
      />}
      {emergencyModalOpen && <EmergencyExceptionModal
        rental={rental}
        checklist={releaseChecklist}
        defaultMileage={defaultPickupMileage}
        onCancel={() => setEmergencyModalOpen(false)}
        onConfirm={async (form) => {
          const saved = await activateRentalWithEmergencyException?.(rental, form);
          if (saved) setEmergencyModalOpen(false);
          return saved;
        }}
      />}
      {adminStepScope && <AdminStepCompletionModal
        rental={rental}
        scope={adminStepScope}
        complete={progressSteps.find((step) => step.key === adminStepScope)?.complete}
        rentalDocument={adminStepScope === 'license' ? license : adminStepScope === 'insurance' ? insurance : null}
        canBypass={Boolean(emergencyAuthorized) && Boolean(progressSteps.find((step) => step.key === adminStepScope)?.bypassable)}
        onCancel={() => setAdminStepScope('')}
        onUpload={(file) => uploadAdminBookingDocument?.(rental, adminStepScope, file)}
        onComplete={(note, metadata) => completeAdminRentalStep?.(rental, adminStepScope, note, metadata)}
        onSignAgreement={(signature) => signAdminRentalAgreement?.(rental, signature)}
        onOpenStripe={() => createAdminPaymentLink?.(rental, 'open')}
        onRecordExternal={() => { setAdminStepScope(''); setExternalPaymentModalOpen(true); }}
        onBypass={() => {
          const scope = adminStepScope;
          setAdminStepScope('');
          setEmergencyStepScope(scope);
        }}
      />}
      {emergencyStepScope && <EmergencyStepBypassModal
        rental={rental}
        scope={emergencyStepScope}
        onCancel={() => setEmergencyStepScope('')}
        onConfirm={async (form) => {
          const saved = await addEmergencyExceptionScope?.(rental, form);
          if (saved) setEmergencyStepScope('');
          return saved;
        }}
      />}
      {cancelModalOpen && <CancelRentalModal
        rental={rental}
        onCancel={() => setCancelModalOpen(false)}
        onConfirm={(reason) => {
          updateRentalStatus(rental.id, 'cancelled', { reason });
          setCancelModalOpen(false);
        }}
      />}
      {editRentalOpen && createPortal(<RentalAmendmentModal
        rental={rental}
        vehicles={vehicles}
        onPreview={previewRentalAmendment}
        onApply={applyRentalAmendment}
        onCancel={() => setEditRentalOpen(false)}
      />, document.body)}
      {refundModalOpen && <RentalPaymentRefundModal
        rental={rental}
        maximumAmount={refundableRentalPayment}
        previousRefunds={rentalRefunds}
        onCancel={() => setRefundModalOpen(false)}
        onConfirm={async (refund) => {
          const submitted = await refundRentalPayment(rental, refund);
          if (submitted) setRefundModalOpen(false);
          return submitted;
        }}
      />}
      {contactModal && <CustomerContactModal profile={rental.profiles || { id: rental.user_id, email: rental.user_email }} rentals={[rental]} emailTemplates={emailTemplates} smsTemplates={smsTemplates} notify={notify} initialTemplateKey={contactModal.extension ? 'manual_extension_payment_due' : contactModal.charge ? 'manual_additional_charge_due' : ''} charge={contactModal.charge || null} extension={contactModal.extension || null} onClose={() => setContactModal(null)} />}
      {deadlineModalOpen && <RentalPaymentDeadlineModal
        rental={rental}
        onCancel={() => setDeadlineModalOpen(false)}
        onConfirm={async (paymentDueAt, reason) => {
          const saved = await updateRentalPaymentDeadline?.(rental, paymentDueAt, reason);
          if (saved) setDeadlineModalOpen(false);
          return saved;
        }}
      />}
    </div>
    <div className="row-actions rental-actions">
      <div className="rental-actions-primary">
        <span className={`workflow-badge ${adminState.tone}`}>{adminState.label}</span>
        {recordTestPayment && rental.payment_status !== 'paid' && canRecordExternalPayment && <button className="approve" onClick={() => setExternalPaymentModalOpen(true)}><CreditCard size={15}/> Record External Payment</button>}
        {canMarkActive && <button className="approve primary-action" onClick={()=>setPickupModal({})}><Car size={15}/> Mark Vehicle Picked Up</button>}
        {canCreateEmergencyException && <button className="emergency-exception-action" onClick={() => setEmergencyModalOpen(true)}><AlertTriangle size={15}/> Global Emergency Override</button>}
        {canCompleteReturn && <button className="approve primary-action" onClick={openReturnPanel}><CheckCircle2 size={15}/> Confirm Return Complete</button>}
        {canRefundRentalPayment && <button type="button" onClick={() => setRefundModalOpen(true)}><ReceiptText size={15}/> Refund Payment</button>}
        {canReleaseDeposit && hasStripeDepositAllocation && <button className="approve" onClick={() => releaseSecurityDeposit(rental)}><DollarSign size={15}/> {rental.deposit_status === 'adjustment_refund_due' ? 'Refund Deposit Decrease' : 'Refund Deposit'}</button>}
        {canReleaseDeposit && hasLocalDepositAllocation && <button className="approve" onClick={() => recordLocalDepositRelease(rental)}><DollarSign size={15}/> Refund External Deposit</button>}
      </div>
      <div className="rental-actions-secondary">
        {detailed && rental.status !== 'cancelled' && <button type="button" className="edit-rental-action" onClick={() => setEditRentalOpen(true)}><Pencil size={15}/> Edit Rental</button>}
        {rental.agreement_snapshot && <button onClick={() => downloadAgreement(rental)}><FileSignature size={15}/> Agreement</button>}
        {canCancel && <button className="reject" onClick={()=>setCancelModalOpen(true)}><XCircle size={15}/> Cancel</button>}
        {detailed
          ? <button type="button" onClick={() => setContactModal({ charge: null })}><MessageCircle size={15}/> Contact Customer</button>
          : <ReminderMenu rental={rental} sendManualReminder={sendManualReminder} />}
      </div>
    </div>
  </div>;
}

function RentalPaymentDeadlineModal({ rental, onCancel, onConfirm }) {
  const dialogRef = useDialogFocus(onCancel);
  const minimumDeadline = new Date(Date.now() + 5 * 60 * 1000);
  const maximumDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 - 60 * 1000);
  const existingDeadline = rental.payment_due_at ? new Date(rental.payment_due_at) : null;
  const initialDeadline = existingDeadline && existingDeadline.getTime() > minimumDeadline.getTime()
    ? existingDeadline
    : new Date(Date.now() + 60 * 60 * 1000);
  const [deadline, setDeadline] = useState(() => formatEasternDateTimeInput(initialDeadline));
  const [reason, setReason] = useState('Customer needs additional time to complete the reservation.');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function tomorrowAtNineEastern() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    const tomorrow = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1));
    return `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, '0')}-${String(tomorrow.getUTCDate()).padStart(2, '0')}T09:00`;
  }

  function chooseQuickDeadline(kind) {
    if (kind === 'tomorrow') return setDeadline(tomorrowAtNineEastern());
    const minutes = { hour: 60, day: 24 * 60, threeDays: 3 * 24 * 60, sevenDays: 7 * 24 * 60 - 1 }[kind];
    setDeadline(formatEasternDateTimeInput(new Date(Date.now() + minutes * 60 * 1000)));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    const paymentDueAt = easternDateTimeInputToIso(deadline);
    if (!paymentDueAt || new Date(paymentDueAt).getTime() <= Date.now()) {
      setError('Choose a future deadline in Eastern Time.');
      return;
    }
    if (reason.trim().length < 5) {
      setError('Enter a short reason so the deadline change is clear in activity history.');
      return;
    }
    setSaving(true);
    const saved = await onConfirm(paymentDueAt, reason);
    if (!saved) setSaving(false);
  }

  return <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
    <form ref={dialogRef} className="admin-modal rental-deadline-modal" role="dialog" aria-modal="true" aria-label="Change reservation payment deadline" onSubmit={submit}>
      <header className="admin-modal-header">
        <CalendarClock size={22}/>
        <div><small>Specific reservation only</small><strong>Change payment deadline</strong><span>{rental.profiles?.full_name || 'Customer'} • {rental.vehicles?.name || 'Vehicle'}</span></div>
        <button type="button" className="admin-close-button" onClick={onCancel} aria-label="Close"><XCircle size={20}/></button>
      </header>
      <div className="rental-deadline-body">
        <div className="deadline-current-summary">
          <span><strong>Current deadline</strong>{rental.payment_due_at ? formatEasternDateTime(rental.payment_due_at) : 'No deadline recorded'}</span>
          <span><strong>Created through</strong>{rental.booking_source === 'admin_manual' ? 'Admin booking' : 'Customer booking'}</span>
        </div>
        <p className="deadline-policy-note"><Clock size={17}/><span>This changes only this unpaid reservation. The normal defaults remain <strong>25 minutes for customer bookings</strong> and <strong>one hour for admin-created bookings</strong>.</span></p>
        <div className="deadline-quick-actions" role="group" aria-label="Quick deadline choices">
          <button type="button" onClick={() => chooseQuickDeadline('hour')}>1 hour</button>
          <button type="button" onClick={() => chooseQuickDeadline('tomorrow')}>Tomorrow at 9 AM</button>
          <button type="button" onClick={() => chooseQuickDeadline('day')}>24 hours</button>
          <button type="button" onClick={() => chooseQuickDeadline('threeDays')}>3 days</button>
          <button type="button" onClick={() => chooseQuickDeadline('sevenDays')}>7 days</button>
        </div>
        <label><span>New deadline — Eastern Time</span><input type="datetime-local" required min={formatEasternDateTimeInput(minimumDeadline)} max={formatEasternDateTimeInput(maximumDeadline)} value={deadline} onChange={(event) => setDeadline(event.target.value)}/></label>
        <label><span>Reason for activity history</span><textarea required minLength="5" maxLength="500" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why this customer needs a different payment deadline."/></label>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <footer className="modal-actions">
        <button type="button" className="secondary-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Saving deadline…' : 'Save This Reservation Deadline'}</button>
      </footer>
    </form>
  </div>;
}

function RentalAmendmentModal({ rental, vehicles = [], onPreview, onApply, onCancel }) {
  const dialogRef = useDialogFocus(onCancel, { closeOnEscape: false });
  const rentalDays = Math.max(1, Math.round(
    (new Date(`${rental.return_date}T12:00:00`).getTime() - new Date(`${rental.pickup_date}T12:00:00`).getTime())
      / 86_400_000
  ));
  const inferredDailyRate = Number(rental.base_rental_total || 0) > 0
    ? Number(rental.base_rental_total) / rentalDays
    : Number(rental.vehicles?.daily_rate || 0);
  const [form, setForm] = useState({
    vehicleId: rental.vehicle_id || '',
    pickupDate: rental.pickup_date || '',
    pickupTime: rental.pickup_time || '9:00 AM',
    returnDate: rental.return_date || '',
    returnTime: rental.return_time || '9:00 AM',
    dailyRate: inferredDailyRate.toFixed(2),
    securityDeposit: Number(rental.security_deposit || 0).toFixed(2),
    adminNotes: rental.admin_notes || '',
    reason: '',
  });
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [closedCorrectionConfirmed, setClosedCorrectionConfirmed] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const paid = String(rental.payment_status || '').toLowerCase() === 'paid';
  const completed = String(rental.status || '').toLowerCase() === 'completed';
  const availableVehicles = vehicles
    .filter((vehicle) =>
      vehicle.id === rental.vehicle_id
      || (
        vehicle.id !== '00000000-0000-4000-8000-000000000015'
        && vehicle.is_active !== false
      )
    )
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setPreview(null);
    setError('');
    setIdempotencyKey(crypto.randomUUID());
  }

  function chooseVehicle(vehicleId) {
    const vehicle = vehicles.find((item) => item.id === vehicleId);
    setForm((current) => ({
      ...current,
      vehicleId,
      dailyRate: Number(vehicle?.daily_rate || 0).toFixed(2),
      securityDeposit: paid ? current.securityDeposit : '',
    }));
    setPreview(null);
    setError('');
    setIdempotencyKey(crypto.randomUUID());
  }

  async function review(event) {
    event.preventDefault();
    setReviewing(true);
    setError('');
    try {
      const result = await onPreview?.(rental, form);
      setPreview(result);
    } catch (previewError) {
      setPreview(null);
      setError(previewError?.message || 'The rental changes could not be reviewed.');
    } finally {
      setReviewing(false);
    }
  }

  async function apply() {
    const minimumReasonLength = completed ? 20 : 10;
    if (form.reason.trim().length < minimumReasonLength) {
      setError(`Enter a specific reason of at least ${minimumReasonLength} characters.`);
      return;
    }
    if (completed && !closedCorrectionConfirmed) {
      setError('Confirm that this is an intentional correction to a completed rental.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onApply?.(rental, form, idempotencyKey);
      onCancel();
    } catch (applyError) {
      setError(applyError?.message || 'The rental changes could not be applied.');
    } finally {
      setSaving(false);
    }
  }

  const settlementCopy = preview?.settlement_status === 'customer_charge_pending'
    ? `${money(preview.total_delta)} will appear under Charge customer.`
    : preview?.settlement_status === 'customer_credit_due'
      ? `${money(Math.abs(Number(preview.total_delta || 0)))} customer credit will be recorded without rewriting the original payment.`
      : preview?.settlement_status === 'unpaid_repriced'
        ? 'The unpaid booking will use the revised total; an old Stripe checkout is replaced when payment starts again.'
        : 'No additional customer payment or credit is required.';

  return <div className="admin-modal-backdrop rental-amendment-backdrop" role="presentation">
    <form ref={dialogRef} className="admin-modal rental-amendment-modal" role="dialog" aria-modal="true" aria-label="Edit rental" onSubmit={review}>
      <header className="admin-modal-header rental-amendment-header">
        <CalendarClock size={22}/>
        <div>
          <small>Guarded rental amendment</small>
          <strong>Edit Existing Rental</strong>
          <span>{rental.profiles?.full_name || 'Customer'} • {rental.vehicles?.name || 'Vehicle'} • {prettyStatus(rental.status)}</span>
        </div>
        <button type="button" className="customer-details-close admin-close-button" onClick={onCancel} disabled={saving} aria-label="Close"><XCircle size={20}/></button>
      </header>

      <div className="rental-amendment-scroll">
        <div className="rental-amendment-guardrail">
          <ShieldCheck size={19}/>
          <span><strong>Availability, three-hour turnaround, payments, deposits, discounts, TollSpot history, and audit records remain protected.</strong> This does not write to Wheelbase availability.</span>
        </div>

        <section className="rental-amendment-section">
          <div className="rental-amendment-section-heading"><span>1</span><div><strong>Schedule and vehicle</strong><small>The database rejects overlapping rentals and calendar blocks.</small></div></div>
          <div className="rental-amendment-grid">
            <label className="wide"><span>Vehicle</span><select value={form.vehicleId} onChange={(event) => chooseVehicle(event.target.value)} required>{availableVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}{vehicle.published === false ? ' — unpublished' : ''}</option>)}</select></label>
            <label><span>Pickup date</span><input type="date" value={form.pickupDate} onChange={(event) => update('pickupDate', event.target.value)} required /></label>
            <label><span>Pickup time</span><select value={form.pickupTime} onChange={(event) => update('pickupTime', event.target.value)}>{calendarTimeOptions(form.pickupTime).map((time) => <option value={time} key={time}>{time}</option>)}</select></label>
            <label><span>Return date</span><input type="date" value={form.returnDate} onChange={(event) => update('returnDate', event.target.value)} required /></label>
            <label><span>Return time</span><select value={form.returnTime} onChange={(event) => update('returnTime', event.target.value)}>{calendarTimeOptions(form.returnTime).map((time) => <option value={time} key={time}>{time}</option>)}</select></label>
          </div>
        </section>

        <section className="rental-amendment-section">
          <div className="rental-amendment-section-heading"><span>2</span><div><strong>Pricing and deposit</strong><small>Age pricing, the saved discount, fees, and Connecticut tax are recalculated server-side.</small></div></div>
          <div className="rental-amendment-grid">
            <label><span>Daily rental rate</span><div className="currency-input"><span>$</span><input type="number" min="0" max={MONEY_MAX} step="0.01" value={form.dailyRate} onChange={(event) => update('dailyRate', event.target.value)} required /></div></label>
            <label><span>Security deposit</span><div className="currency-input"><span>$</span><input type="number" min="0" max={MONEY_MAX} step="0.01" value={form.securityDeposit} onChange={(event) => update('securityDeposit', event.target.value)} disabled={paid} /></div>{paid && <small>Already paid: use the protected deposit adjustment workflow instead of rewriting held funds.</small>}</label>
            <label className="wide"><span>Admin notes</span><textarea maxLength="2000" value={form.adminNotes} onChange={(event) => update('adminNotes', event.target.value)} placeholder="Operational notes visible to staff."/></label>
          </div>
        </section>

        <section className="rental-amendment-section">
          <div className="rental-amendment-section-heading"><span>3</span><div><strong>Reason and review</strong><small>The reason and exact before/after values become permanent audit history.</small></div></div>
          <label className="rental-amendment-reason"><span>Reason for change</span><textarea minLength={completed ? 20 : 10} maxLength="1000" value={form.reason} onChange={(event) => update('reason', event.target.value)} placeholder="Example: Customer moved pickup to Monday and needs the Audi Q5 instead." required /></label>
          {completed && <label className="closed-rental-confirmation"><input type="checkbox" checked={closedCorrectionConfirmed} onChange={(event) => setClosedCorrectionConfirmed(event.target.checked)}/><span><strong>Correct this completed rental</strong><small>I understand the settled payment and original audit history will remain intact.</small></span></label>}
        </section>

        {preview && <section className="rental-amendment-preview" aria-live="polite">
          <div className="rental-amendment-preview-heading"><CheckCircle2 size={20}/><div><strong>Safe to apply</strong><span>The schedule and financial preview passed all database guardrails.</span></div></div>
          <div className="rental-amendment-comparison">
            <article><small>Current</small><strong>{preview.old?.vehicle_name}</strong><span>{formatRentalDate(preview.old?.pickup_date, preview.old?.pickup_time)} → {formatRentalDate(preview.old?.return_date, preview.old?.return_time)}</span><em>{money(preview.old?.total)} total</em></article>
            <ArrowRight size={20}/>
            <article><small>Revised</small><strong>{preview.new?.vehicle_name}</strong><span>{formatRentalDate(preview.new?.pickup_date, preview.new?.pickup_time)} → {formatRentalDate(preview.new?.return_date, preview.new?.return_time)}</span><em>{money(preview.new?.total)} total</em></article>
          </div>
          <div className={`rental-amendment-settlement ${Number(preview.total_delta || 0) > 0 ? 'due' : Number(preview.total_delta || 0) < 0 ? 'credit' : ''}`}>
            <ReceiptText size={18}/>
            <span><strong>{Number(preview.total_delta || 0) === 0 ? 'No balance change' : `${Number(preview.total_delta || 0) > 0 ? 'Additional balance' : 'Customer credit'}: ${money(Math.abs(Number(preview.total_delta || 0)))}`}</strong><small>{settlementCopy}</small></span>
          </div>
          {preview.requires_customer_resign && <div className="rental-amendment-resign"><FileSignature size={17}/><span><strong>Revised agreement required</strong><small>The prior signed copy stays preserved; pickup controls remain guarded until the customer signs the revised terms.</small></span></div>}
          {preview.new?.vehicle_published === false && <div className="rental-amendment-warning"><AlertTriangle size={17}/><span>The replacement vehicle is unpublished. Admin assignment is allowed, but customers cannot select it for new bookings.</span></div>}
        </section>}

        {error && <p className="form-error rental-amendment-error" role="alert">{error}</p>}
      </div>

      <footer className="rental-amendment-actions">
        <button type="button" className="secondary-btn" onClick={onCancel} disabled={saving}>Cancel</button>
        {!preview
          ? <button type="submit" className="primary-btn" disabled={reviewing || saving}>{reviewing ? 'Checking availability…' : 'Review Changes'}</button>
          : <button type="button" className="primary-btn" onClick={apply} disabled={saving || (completed && !closedCorrectionConfirmed)}>{saving ? 'Applying safely…' : 'Apply Rental Changes'}</button>}
      </footer>
    </form>
  </div>;
}

function AdminBookingProcedure({ rental, checklist, bypassedScopes = new Set(), sendBookingCompletionLink, uploadAdminBookingDocument, createAdminPaymentLink, recordExternalPayment }) {
  const [busy, setBusy] = useState('');
  const prerequisitesForPayment = checklist.phone && checklist.identity && checklist.agreement && checklist.license && checklist.insurance;
  const paymentPreference = rental.admin_payment_collection_preference || 'customer_link';
  const steps = [
    ['Phone', checklist.phone, 'Customer completes by secure link'],
    ['Identity', checklist.identity, 'Customer completes Stripe Identity'],
    ['License', checklist.license, 'Customer or admin uploads; admin reviews'],
    ['Insurance', checklist.insurance, 'Required for this rental; admin reviews'],
    ['Agreement', checklist.agreement, 'Customer must personally sign'],
    ['Payment', checklist.payment, 'Stripe Checkout or recorded local payment'],
  ];
  const nextStep = steps.find(([, complete]) => !complete);

  async function run(key, callback) {
    setBusy(key);
    try { await callback(); } finally { setBusy(''); }
  }

  function upload(type, event) {
    const file = event.target.files?.[0];
    if (file) run(`upload-${type}`, () => uploadAdminBookingDocument?.(rental, type, file));
    event.target.value = '';
  }

  return <details className="admin-booking-procedure" open>
    <summary><ClipboardList size={16}/><span>Booking procedure console</span><em>{steps.filter(([, complete]) => complete).length}/{steps.length} complete</em></summary>
    <div className="procedure-step-grid">
      {steps.map(([label, complete, detail]) => {
        const bypassed = bypassedScopes.has(label.toLowerCase());
        return <div className={bypassed ? 'bypassed' : complete ? 'complete' : ''} key={label}>
          {bypassed ? <AlertTriangle size={16}/> : complete ? <CheckCircle2 size={16}/> : <Clock size={16}/>}
          <span><strong>{label}</strong><small>{bypassed ? 'Emergency bypass active' : complete ? 'Complete' : detail}</small></span>
        </div>;
      })}
    </div>
    {nextStep && <div className="procedure-next"><ArrowRight size={15}/><span><strong>Next required step: {nextStep[0]}</strong> — {nextStep[2]}</span></div>}
    {!checklist.payment && <div className="procedure-payment-plan"><CreditCard size={16}/><span><strong>Payment plan:</strong> {manualPaymentPreferenceLabel(paymentPreference)}</span></div>}
    <div className="procedure-actions">
      <button type="button" className="approve procedure-send-primary" disabled={Boolean(busy)} onClick={() => run('both', () => sendBookingCompletionLink?.(rental, 'both'))}><Send size={15}/>{busy === 'both' ? ' Sending…' : ' Send checklist by email + text'}</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run('text', () => sendBookingCompletionLink?.(rental, 'text'))}><MessageCircle size={15}/>{busy === 'text' ? ' Sending…' : ' Text only'}</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run('email', () => sendBookingCompletionLink?.(rental, 'email'))}><Mail size={15}/>{busy === 'email' ? ' Sending…' : ' Email only'}</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run('copy', () => sendBookingCompletionLink?.(rental, 'copy'))}><ExternalLink size={15}/> Copy secure checklist link</button>
      <label className="procedure-upload"><FileText size={15}/>{busy === 'upload-license' ? ' Uploading…' : ' Upload license'}<input type="file" accept="image/*,.pdf" disabled={Boolean(busy)} onChange={(event) => upload('license', event)}/></label>
      <label className="procedure-upload"><ShieldCheck size={15}/>{busy === 'upload-insurance' ? ' Uploading…' : ' Upload insurance'}<input type="file" accept="image/*,.pdf" disabled={Boolean(busy)} onChange={(event) => upload('insurance', event)}/></label>
      {!checklist.payment && <button type="button" className={paymentPreference === 'admin_stripe' ? 'approve procedure-payment-primary' : 'approve'} disabled={Boolean(busy) || !prerequisitesForPayment} title={!prerequisitesForPayment ? 'Phone, identity, approved documents, and agreement are required first.' : 'Opens PCI-compliant Stripe Checkout; do not enter card data in the admin portal.'} onClick={() => run('payment', () => createAdminPaymentLink?.(rental, 'open'))}><CreditCard size={15}/>{busy === 'payment' ? ' Starting…' : ' Open Stripe Checkout on this device'}</button>}
      {!checklist.payment && <button type="button" className={paymentPreference === 'external' ? 'approve procedure-payment-primary' : ''} disabled={Boolean(busy) || !prerequisitesForPayment} title={!prerequisitesForPayment ? 'Phone, identity, approved documents, and agreement are required first.' : 'Use only after the external payment actually cleared.'} onClick={() => run('external-payment', () => recordExternalPayment?.(rental))}><DollarSign size={15}/>{busy === 'external-payment' ? ' Recording…' : ' Record External Payment'}</button>}
    </div>
    <small className="procedure-safety-note">Secure checklist links sign the customer in. Share only with the named customer. Never mark identity or agreement complete on their behalf.</small>
  </details>;
}

const EMERGENCY_SCOPE_LABELS = {
  phone: 'Phone verification',
  identity: 'Identity verification',
  license: 'Approved driver license',
  insurance: 'Approved rental insurance',
  agreement: 'Signed agreement',
  payment: 'Payment received',
};

function emergencyDateTimeValue(date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function EmergencyExceptionModal({ rental, checklist, defaultMileage, onCancel, onConfirm }) {
  const dialogRef = useDialogFocus(onCancel);
  const missingScopes = Object.keys(EMERGENCY_SCOPE_LABELS).filter((scope) => !checklist[scope]);
  const [form, setForm] = useState({
    scopes: missingScopes,
    reason: '',
    evidenceNote: '',
    expiresAt: emergencyDateTimeValue(new Date(Date.now() + 4 * 60 * 60 * 1000)),
    startingMileage: defaultMileage,
    confirmation: '',
  });
  const [saving, setSaving] = useState(false);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  function toggleScope(scope) {
    setForm((current) => ({
      ...current,
      scopes: current.scopes.includes(scope)
        ? current.scopes.filter((item) => item !== scope)
        : [...current.scopes, scope],
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    await onConfirm(form);
    setSaving(false);
  }

  return <div className="admin-modal-backdrop" role="presentation">
    <form ref={dialogRef} className="admin-modal emergency-exception-modal" role="dialog" aria-modal="true" aria-label="Create Emergency Rental Exception" onSubmit={submit}>
      <div className="admin-modal-header danger">
        <div><p className="eyebrow">Extraordinary Case</p><h3>Release With Emergency Exception</h3></div>
        <button type="button" className="admin-close-button" onClick={onCancel} aria-label="Close"><XCircle size={20}/></button>
      </div>
      <div className="emergency-truth-warning"><AlertTriangle size={20}/><span>This permits vehicle release; it does not mark verification, documents, agreement, or payment complete. Every exception stays visible and auditable.</span></div>
      <div className="emergency-rental-summary"><strong>{rental.profiles?.full_name || 'Customer'} • {rental.vehicles?.name || 'Vehicle'}</strong><span>{formatRentalDate(rental.pickup_date, rental.pickup_time)} → {formatRentalDate(rental.return_date, rental.return_time)}</span></div>
      <fieldset className="emergency-scope-list">
        <legend>Explicitly select every incomplete procedure</legend>
        {missingScopes.map((scope) => <label key={scope}>
          <input type="checkbox" checked={form.scopes.includes(scope)} onChange={() => toggleScope(scope)}/>
          <span><strong>{EMERGENCY_SCOPE_LABELS[scope]}</strong><small>Remains incomplete after release</small></span>
        </label>)}
      </fieldset>
      <label><span>Emergency reason</span><textarea required minLength="20" maxLength="1000" value={form.reason} onChange={(event) => update('reason', event.target.value)} placeholder="Explain the extraordinary circumstances, who authorized the decision, and why waiting is not practical."/></label>
      <label><span>Evidence or follow-up note</span><textarea maxLength="1000" value={form.evidenceNote} onChange={(event) => update('evidenceNote', event.target.value)} placeholder="Paper agreement location, insurer confirmation, payment plan, callback reference…"/></label>
      <div className="emergency-form-grid">
        <label><span>Exception expires</span><input type="datetime-local" required min={emergencyDateTimeValue(new Date(Date.now() + 15 * 60 * 1000))} max={emergencyDateTimeValue(new Date(Date.now() + 24 * 60 * 60 * 1000))} value={form.expiresAt} onChange={(event) => update('expiresAt', event.target.value)}/></label>
        <label><span>Starting mileage</span><input type="number" min="0" step="1" required value={form.startingMileage} onChange={(event) => update('startingMileage', event.target.value)}/></label>
      </div>
      <label><span>Type RELEASE WITH EXCEPTION</span><input required autoComplete="off" value={form.confirmation} onChange={(event) => update('confirmation', event.target.value)} placeholder="RELEASE WITH EXCEPTION"/></label>
      <div className="modal-actions">
        <button type="button" className="secondary-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="danger-confirm-btn" disabled={saving || form.scopes.length !== missingScopes.length || form.confirmation !== 'RELEASE WITH EXCEPTION'}>{saving ? 'Recording exception…' : 'Record Exception & Release Vehicle'}</button>
      </div>
    </form>
  </div>;
}

function AdminStepCompletionModal({ rental, scope, complete, rentalDocument, canBypass, onCancel, onUpload, onComplete, onSignAgreement, onOpenStripe, onRecordExternal, onBypass }) {
  const dialogRef = useDialogFocus(onCancel);
  const agreementScrollRef = useRef(null);
  const [note, setNote] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [depositDisposition, setDepositDisposition] = useState(rental.payment_status === 'paid' ? 'collected' : 'waived');
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [signatureName, setSignatureName] = useState(rental.profiles?.full_name || rental.customer_name_snapshot || '');
  const [signatureImage, setSignatureImage] = useState('');
  const label = prettyStatus(scope);
  const isDocument = ['license', 'insurance'].includes(scope);
  const alreadySigned = scope === 'agreement' && Boolean(rental.agreement_snapshot);
  const [agreementReviewed, setAgreementReviewed] = useState(alreadySigned);
  const displayedAgreement = alreadySigned ? rental.agreement_snapshot : AGREEMENT_TEXT;
  const displayedSignatureImage = alreadySigned ? extractSignatureImage(displayedAgreement) : '';
  const printableAgreement = String(displayedAgreement || '').replace(
    /Drawn Signature Image:\s*data:image\/png;base64,[^\s]+/,
    'Drawn Signature Image: embedded below',
  );

  function trackAgreementReview() {
    const reviewBox = agreementScrollRef.current;
    if (!reviewBox || agreementReviewed) return;
    const reachedEnd = reviewBox.scrollTop + reviewBox.clientHeight >= reviewBox.scrollHeight - 24;
    if (reachedEnd) setAgreementReviewed(true);
  }

  function skipAgreementToEnd() {
    const reviewBox = agreementScrollRef.current;
    if (!reviewBox) return;
    reviewBox.scrollTop = reviewBox.scrollHeight;
    setAgreementReviewed(true);
  }

  useEffect(() => {
    const reviewBox = agreementScrollRef.current;
    if (scope !== 'agreement' || !reviewBox || alreadySigned) return;
    if (reviewBox.scrollHeight <= reviewBox.clientHeight + 24) setAgreementReviewed(true);
  }, [scope, alreadySigned, displayedAgreement]);

  async function completeStep(event) {
    event.preventDefault();
    if (note.trim().length < 5) {
      setError('Add a completion note of at least 5 characters so staff can see what was verified.');
      return;
    }
    if (scope === 'agreement' && !alreadySigned) {
      if (!agreementReviewed) return setError('Scroll through the complete rental agreement before signing.');
      if (!agreementChecked) return setError('The customer must check “I Agree to the Terms.”');
      if (signatureName.trim().length < 2) return setError('Enter the customer’s full legal signature name.');
      if (!signatureImage) return setError('The customer must draw an e-signature.');
    }
    setBusy(true);
    setError('');
    try {
      if (isDocument && file) {
        const uploaded = await onUpload?.(file);
        if (!uploaded) return;
      }
      const saved = scope === 'agreement'
        ? await onSignAgreement?.({ name: signatureName.trim(), image: signatureImage, note: note.trim() })
        : await onComplete?.(note.trim(), scope === 'deposit' ? { disposition: depositDisposition } : { verified_in_person: true, uploaded_document: Boolean(file) });
      if (saved) onCancel();
    } finally {
      setBusy(false);
    }
  }

  if (scope === 'payment') {
    return createPortal(<div className="admin-modal-backdrop" role="presentation">
      <div ref={dialogRef} className="admin-modal admin-step-modal" role="dialog" aria-modal="true" aria-labelledby="admin-step-title">
        <header className="admin-modal-header"><CreditCard size={21}/><div><small>Booking step</small><strong id="admin-step-title">Payment</strong><span>{rental.profiles?.full_name || rental.customer_name_snapshot} • {money(Number(rental.rental_total || 0) + Number(rental.service_fee_total || 0) + Number(rental.tax_amount || 0) + Number(rental.security_deposit || 0))} due</span></div></header>
        {complete ? <div className="step-complete-summary"><CheckCircle2 size={19}/><span><strong>Payment is complete.</strong> The payment and deposit remain linked to this booking.</span></div> : <div className="admin-payment-choice">
          <button type="button" className="primary-btn" onClick={async () => { setBusy(true); await onOpenStripe?.(); setBusy(false); }} disabled={busy}><CreditCard size={16}/> Open secure Stripe checkout on this device</button>
          <button type="button" className="secondary-btn" onClick={onRecordExternal}><Banknote size={16}/> Record phone / external payment as completed</button>
          {canBypass && <button type="button" className="emergency-exception-action" onClick={onBypass}><AlertTriangle size={16}/> Emergency: bypass only Payment</button>}
          <small>Stripe payments reconcile automatically. External payments require the exact amount and payment method before they are marked paid.</small>
        </div>}
        <div className="modal-actions"><button type="button" onClick={onCancel}>Close</button></div>
      </div>
    </div>, globalThis.document.body);
  }

  return createPortal(<div className={`admin-modal-backdrop ${scope === 'agreement' ? 'agreement-step-backdrop' : ''}`} role="presentation">
    <form ref={dialogRef} className={`admin-modal admin-step-modal ${scope === 'agreement' ? 'agreement-step-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="admin-step-title" onSubmit={completeStep}>
      <header className="admin-modal-header"><CheckCircle2 size={21}/><div><small>Admin-assisted booking</small><strong id="admin-step-title">{complete ? `Review ${label}` : `Complete ${label}`}</strong><span>{rental.profiles?.full_name || rental.customer_name_snapshot} • every action is added to activity history</span></div><button type="button" className="admin-close-button" onClick={onCancel} aria-label={`Close ${label} step`}><XCircle size={20}/></button></header>
      {complete && scope !== 'agreement' ? <div className="step-complete-summary"><CheckCircle2 size={19}/><span><strong>This step is complete.</strong> Re-completing it will update the audit note and verification time.</span></div> : null}
      {isDocument && <div className="admin-document-completion">
        <p>{rentalDocument ? `${docLabel(scope)} is currently ${prettyStatus(rentalDocument.status)}.` : `No ${docLabel(scope).toLowerCase()} file is saved yet.`}</p>
        <label className="procedure-upload"><Upload size={15}/> {file ? file.name : `Upload ${docLabel(scope)} (optional when inspected in person)`}<input type="file" accept="image/*,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)}/></label>
      </div>}
      {scope === 'identity' && <div className="assisted-identity-note"><UserRound size={18}/><span><strong>Physical identity check</strong><small>Inspect the customer and their government-issued driver’s license. Completing this step records “Admin verified in person”; Stripe Identity will no longer block this booking.</small></span></div>}
      {scope === 'phone' && <p className="muted">Confirm the phone number with the customer in person, then record that verification below.</p>}
      {scope === 'deposit' && <label><span>Deposit decision</span><select value={depositDisposition} onChange={(event) => setDepositDisposition(event.target.value)}>{rental.payment_status === 'paid' && <option value="collected">Collected with completed payment</option>}<option value="waived">Waived by management</option></select><small>{rental.payment_status === 'paid' ? 'A captured Stripe deposit cannot be waived here; use the refund workflow instead.' : 'Record a full phone/external payment or Stripe payment to collect the deposit. The standalone pre-payment action is a documented waiver.'}</small></label>}
      {scope === 'agreement' && <>
        <div className={`admin-agreement-review-status ${agreementReviewed ? 'complete' : ''}`} role="status" aria-live="polite">
          {alreadySigned
            ? 'This is the exact signed agreement stored with this rental.'
            : agreementReviewed
              ? 'Full agreement reviewed. The acknowledgment and signature fields are unlocked below.'
              : <><span>“I Agree to the Terms” remains disabled until you scroll through the agreement to the bottom.</span><button type="button" className="agreement-skip-button" onClick={skipAgreementToEnd}>Skip to bottom and unlock “I Agree”</button></>}
        </div>
        <div ref={agreementScrollRef} className="admin-agreement-scroll-box" onScroll={trackAgreementReview} tabIndex="0" aria-label="Complete rental agreement">
          <pre>{printableAgreement}</pre>
          {alreadySigned && displayedSignatureImage && <div className="admin-agreement-stored-signature"><strong>Stored electronic signature</strong><img src={displayedSignatureImage} alt={`Electronic signature for ${rental.agreement_signature_name || 'customer'}`}/></div>}
        </div>
        {!alreadySigned && <div className="admin-agreement-sign-box">
          <label className="checkbox-row"><input type="checkbox" checked={agreementChecked} onChange={(event) => setAgreementChecked(event.target.checked)} disabled={!agreementReviewed}/> I have read and agree to the rental agreement.</label>
          <label><span>Customer’s full legal signature</span><input value={signatureName} onChange={(event) => setSignatureName(event.target.value)} placeholder="Full legal name" autoComplete="name" disabled={!agreementReviewed}/></label>
          <AdminSignaturePad value={signatureImage} onChange={setSignatureImage} disabled={!agreementReviewed}/>
        </div>}
      </>}
      {(!alreadySigned || scope !== 'agreement') && <label><span>{scope === 'agreement' ? 'In-office signing note' : 'Completion note'}</span><textarea value={note} onChange={(event) => { setNote(event.target.value); setError(''); }} maxLength="500" placeholder={scope === 'agreement' ? 'Customer reviewed and signed while physically present.' : 'Describe what you inspected or how this requirement was completed.'}/><small>{Math.min(note.trim().length, 5)}/5 minimum characters</small></label>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {canBypass && !complete && <div className="document-step-bypass-option">
        <span><strong>Emergency only</strong> This bypasses only {label.toLowerCase()}, remains auditable, and does not release the vehicle by itself.</span>
        <button type="button" className="emergency-exception-action" disabled={busy} onClick={onBypass}><AlertTriangle size={15}/> Bypass only {label}</button>
      </div>}
      <div className="modal-actions"><button type="button" onClick={onCancel} disabled={busy}>{alreadySigned ? 'Close' : 'Cancel'}</button>{alreadySigned && <button type="button" className="secondary-btn" onClick={() => downloadAgreement(rental)}><FileSignature size={15}/> Download Agreement</button>}{!alreadySigned && <button type="submit" className="approve" disabled={busy || (scope === 'agreement' && (!agreementReviewed || !agreementChecked || signatureName.trim().length < 2 || !signatureImage))}>{busy ? 'Saving…' : scope === 'agreement' ? 'Save Signed Agreement' : `Mark ${label} Complete`}</button>}</div>
    </form>
  </div>, globalThis.document.body);
}

function AdminSignaturePad({ value, onChange, disabled = false }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  function point(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const source = event.touches?.[0] || event;
    return { x: (source.clientX - rect.left) * (canvas.width / rect.width), y: (source.clientY - rect.top) * (canvas.height / rect.height) };
  }
  function start(event) {
    if (disabled) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    const startPoint = point(event);
    context.beginPath();
    context.moveTo(startPoint.x, startPoint.y);
    drawingRef.current = true;
  }
  function draw(event) {
    if (!drawingRef.current) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    const nextPoint = point(event);
    context.strokeStyle = '#111b16';
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.lineTo(nextPoint.x, nextPoint.y);
    context.stroke();
  }
  function finish() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    onChange(canvasRef.current.toDataURL('image/png'));
  }
  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    onChange('');
  }
  useEffect(() => {
    if (!value) clear();
  }, []);
  return <div className={`admin-signature-pad ${disabled ? 'disabled' : ''}`}><span>Customer e-signature</span><canvas ref={canvasRef} width="900" height="240" aria-disabled={disabled} onMouseDown={start} onMouseMove={draw} onMouseUp={finish} onMouseLeave={finish} onTouchStart={start} onTouchMove={draw} onTouchEnd={finish}/><button type="button" onClick={clear} disabled={disabled}>Clear signature</button></div>;
}

function DocumentStepActionModal({ rental, scope, canBypass, onCancel, onUpload, onBypass }) {
  const dialogRef = useDialogFocus(onCancel);
  const [busy, setBusy] = useState(false);
  const label = scope === 'license' ? 'Driver License' : 'Insurance';

  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) return;
    setBusy(true);
    const saved = await onUpload?.(file);
    setBusy(false);
    if (saved) onCancel();
  }

  return <div className="admin-modal-backdrop" role="presentation">
    <div ref={dialogRef} className="admin-modal document-step-action-modal" role="dialog" aria-modal="true" aria-label={`Manage ${label}`}>
      <div className="admin-modal-header">
        {scope === 'license' ? <FileText size={20}/> : <ShieldCheck size={20}/>}
        <div><p className="eyebrow">Document Step</p><h3>{label}</h3></div>
        <button type="button" className="admin-close-button" onClick={onCancel} aria-label="Close"><XCircle size={20}/></button>
      </div>
      <div className="document-step-action-copy">
        <strong>{rental.profiles?.full_name || 'Customer'} • {rental.vehicles?.name || 'Vehicle'}</strong>
        <span>Upload the customer-provided {label.toLowerCase()} image or PDF. It will remain pending until an admin reviews and approves it.</span>
      </div>
      <label className={`document-step-upload-button ${busy ? 'is-busy' : ''}`}>
        <Upload size={18}/>{busy ? `Uploading ${label}…` : `Choose ${label} File`}
        <input type="file" accept="image/*,.pdf,application/pdf" disabled={busy} onChange={upload}/>
      </label>
      {canBypass && <div className="document-step-bypass-option">
        <span><strong>Emergency only</strong> Bypassing does not approve a document and remains auditable.</span>
        <button type="button" className="emergency-exception-action" disabled={busy} onClick={onBypass}><AlertTriangle size={15}/> Bypass only this step</button>
      </div>}
      <div className="modal-actions">
        <button type="button" className="secondary-btn" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  </div>;
}

function EmergencyStepBypassModal({ rental, scope, onCancel, onConfirm }) {
  const dialogRef = useDialogFocus(onCancel);
  const reasonRef = useRef(null);
  const confirmationRef = useRef(null);
  const [form, setForm] = useState({
    scope,
    reason: '',
    evidenceNote: '',
    expiresAt: emergencyDateTimeValue(new Date(Date.now() + 4 * 60 * 60 * 1000)),
    confirmation: '',
  });
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const reasonLength = form.reason.trim().length;
  const reasonValid = reasonLength >= 20;
  const confirmationValid = form.confirmation === 'BYPASS STEP';

  async function submit(event) {
    event.preventDefault();
    setSubmitted(true);
    if (!reasonValid) {
      reasonRef.current?.focus();
      return;
    }
    if (!confirmationValid) {
      confirmationRef.current?.focus();
      return;
    }
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    setSaving(true);
    await onConfirm(form);
    setSaving(false);
  }

  return <div className="admin-modal-backdrop" role="presentation">
    <form ref={dialogRef} className="admin-modal emergency-step-modal" role="dialog" aria-modal="true" aria-label={`Bypass ${EMERGENCY_SCOPE_LABELS[scope] || prettyStatus(scope)}`} onSubmit={submit} noValidate>
      <div className="admin-modal-header danger">
        <AlertTriangle size={20}/>
        <div><p className="eyebrow">One Step Only</p><h3>Bypass {EMERGENCY_SCOPE_LABELS[scope] || prettyStatus(scope)}</h3></div>
        <button type="button" className="admin-close-button" onClick={onCancel} aria-label="Close"><XCircle size={20}/></button>
      </div>
      <div className="emergency-truth-warning"><ShieldCheck size={20}/><span>Only this step receives a temporary exception. Every other incomplete step remains required, and this action does not release the vehicle.</span></div>
      <div className="emergency-rental-summary"><strong>{rental.profiles?.full_name || 'Customer'} • {rental.vehicles?.name || 'Vehicle'}</strong><span>The vehicle can be released only after every other requirement is complete or separately bypassed.</span></div>
      <label className={!reasonValid && (submitted || form.reason.length > 0) ? 'field-has-error' : ''}><span>Emergency reason <strong>Required — minimum 20 characters</strong></span><textarea ref={reasonRef} required minLength="20" maxLength="1000" aria-invalid={!reasonValid && (submitted || form.reason.length > 0)} aria-describedby="step-bypass-reason-help" value={form.reason} onChange={(event) => update('reason', event.target.value)} placeholder="Explain exactly why this one requirement must be bypassed and who authorized it."/><small id="step-bypass-reason-help" className={`field-requirement ${reasonValid ? 'valid' : ''}`}><span>{reasonValid ? 'Reason requirement met.' : `Add ${20 - reasonLength} more character${20 - reasonLength === 1 ? '' : 's'} to continue.`}</span><strong>{reasonLength}/20 minimum</strong></small></label>
      <label><span>Evidence or follow-up note</span><textarea maxLength="1000" value={form.evidenceNote} onChange={(event) => update('evidenceNote', event.target.value)} placeholder="Insurer callback, paper document location, payment arrangement, verification reference…"/></label>
      <label><span>Exception expires</span><input type="datetime-local" required min={emergencyDateTimeValue(new Date(Date.now() + 15 * 60 * 1000))} max={emergencyDateTimeValue(new Date(Date.now() + 24 * 60 * 60 * 1000))} value={form.expiresAt} onChange={(event) => update('expiresAt', event.target.value)}/></label>
      <label className={!confirmationValid && submitted ? 'field-has-error' : ''}><span>Type BYPASS STEP</span><input ref={confirmationRef} required autoComplete="off" aria-invalid={!confirmationValid && submitted} value={form.confirmation} onChange={(event) => update('confirmation', event.target.value)} placeholder="BYPASS STEP"/><small className={`field-requirement ${confirmationValid ? 'valid' : ''}`}>{confirmationValid ? 'Confirmation phrase matches.' : 'Enter the exact phrase shown above.'}</small></label>
      <div className={`bypass-form-status ${reasonValid && confirmationValid ? 'ready' : ''}`} role="status" aria-live="polite">
        {reasonValid && confirmationValid ? <><CheckCircle2 size={16}/><span>Ready to record this one-step bypass.</span></> : <><AlertTriangle size={16}/><span>{!reasonValid ? 'Emergency reason must contain at least 20 characters.' : 'Enter BYPASS STEP exactly to continue.'}</span></>}
      </div>
      <div className="modal-actions">
        <button type="button" className="secondary-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="danger-confirm-btn" disabled={saving}>{saving ? 'Recording bypass…' : 'Bypass Only This Step'}</button>
      </div>
    </form>
  </div>;
}

function EmergencyExceptionBanner({ exception, checklist, onResolve }) {
  const expired = new Date(exception.expires_at).getTime() <= Date.now();
  const resolved = new Set(exception.resolved_scopes || []);
  return <div className={`emergency-exception-banner ${expired ? 'expired' : ''}`}>
    <div className="emergency-exception-heading"><AlertTriangle size={19}/><div><strong>{expired ? 'EXPIRED EMERGENCY EXCEPTION' : 'ACTIVE — EMERGENCY EXCEPTION'}</strong><span>Expires {new Date(exception.expires_at).toLocaleString()} • {exception.reason}</span></div></div>
    <div className="emergency-exception-scopes">
      {(exception.exception_scopes || []).map((scope) => {
        const complete = Boolean(checklist[scope]);
        const isResolved = resolved.has(scope);
        return <div className={isResolved ? 'resolved' : complete ? 'ready-to-resolve' : ''} key={scope}>
          <span>{isResolved ? <CheckCircle2 size={14}/> : <Clock size={14}/>} {EMERGENCY_SCOPE_LABELS[scope] || prettyStatus(scope)}</span>
          {isResolved ? <em>Resolved</em> : complete ? <button type="button" onClick={() => onResolve(scope)}>Confirm resolved</button> : <em>Still incomplete</em>}
        </div>;
      })}
    </div>
    {exception.evidence_note && <small>Follow-up: {exception.evidence_note}</small>}
  </div>;
}

function RentalChargeManager({ rental, charges = [], addRentalCharge, waiveRentalCharge, chargeRentalSavedCard, sendPaymentLink }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [chargingId, setChargingId] = useState('');
  const [form, setForm] = useState({ name: '', chargeType: 'toll', amount: '', taxable: true, description: '' });

  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim() || Number(form.amount) <= 0) return;
    setSaving(true);
    const saved = await addRentalCharge?.(rental.id, { ...form, name: form.name.trim(), description: form.description.trim() });
    setSaving(false);
    if (saved) {
      setForm({ name: '', chargeType: 'toll', amount: '', taxable: true, description: '' });
      setOpen(false);
    }
  }

  async function chargeCard(charge, options = {}) {
    setChargingId(charge.id);
    const saved = await chargeRentalSavedCard?.(charge, options);
    setChargingId('');
    return saved;
  }
  const collectible = charges.filter((charge) => !charge.included_in_initial_payment && ['pending', 'failed', 'checkout_open'].includes(charge.status));
  const outstandingTotal = collectible.reduce((sum, charge) => sum + Number(charge.total_amount || 0), 0);
  const paidTotal = charges.filter((charge) => charge.status === 'paid').reduce((sum, charge) => sum + Number(charge.total_amount || 0), 0);
  const automaticSources = new Set(['late_return', 'tollspot']);
  const automaticCharges = charges.filter((charge) => automaticSources.has(String(charge.source_type || '').toLowerCase()));
  const otherCharges = charges.filter((charge) => !automaticSources.has(String(charge.source_type || '').toLowerCase()));
  const automaticCollectible = automaticCharges.filter((charge) => collectible.some((item) => item.id === charge.id));
  const automaticLateTotal = automaticCollectible
    .filter((charge) => charge.source_type === 'late_return')
    .reduce((sum, charge) => sum + Number(charge.total_amount || 0), 0);
  const automaticTollTotal = automaticCollectible
    .filter((charge) => charge.source_type === 'tollspot')
    .reduce((sum, charge) => sum + Number(charge.total_amount || 0), 0);
  const automaticCollectibleTotal = automaticCollectible
    .reduce((sum, charge) => sum + Number(charge.total_amount || 0), 0);

  async function chargeAllAutomatic() {
    if (!automaticCollectible.length || chargingId) return;
    const label = automaticCollectible.length === 1
      ? `the ${automaticCollectible[0].name} charge`
      : `${automaticCollectible.length} automatic charges`;
    if (!window.confirm(`Charge the customer's saved card ${money(automaticCollectibleTotal)} for ${label}? This attempts the charge immediately.`)) return;

    setChargingId('automatic-all');
    for (const charge of automaticCollectible) {
      const saved = await chargeRentalSavedCard?.(charge, { skipConfirmation: true });
      if (!saved) break;
    }
    setChargingId('');
  }

  function renderChargeActions(charge) {
    if (charge.included_in_initial_payment || !['pending', 'failed', 'checkout_open'].includes(charge.status)) return null;
    return <div className="row-actions charge-collection-actions">
      <button type="button" onClick={() => sendPaymentLink?.(charge)}><Send size={14}/> Send payment link</button>
      <button type="button" className="approve" disabled={Boolean(chargingId)} onClick={() => chargeCard(charge)}><CreditCard size={14}/>{chargingId === charge.id ? ' Charging…' : ' Charge customer'}</button>
      <button type="button" className="reject" disabled={Boolean(chargingId)} onClick={() => waiveRentalCharge?.(charge.id)}>Waive</button>
    </div>;
  }

  function renderChargeRow(charge) {
    return <div className="extension-action-row" key={charge.id}>
      <div><span>{charge.name} • {prettyStatus(charge.status)}</span><small>{prettyStatus(charge.charge_type)} • {money(charge.amount)}{Number(charge.tax_amount) > 0 ? ` + ${money(charge.tax_amount)} tax` : ''} • {money(charge.total_amount)} total</small>{charge.last_admin_charge_error && <small className="form-error">Last card attempt: {charge.last_admin_charge_error}</small>}</div>
      {renderChargeActions(charge)}
    </div>;
  }

  return <div className="rental-charge-manager">
    <div className="rental-charge-heading"><div><strong>Rental charges</strong><small>Automatic late fees and tolls, plus manual damage, cleaning &amp; add-ons</small></div><button type="button" onClick={() => setOpen((value) => !value)}><Plus size={14}/> Add manual charge</button></div>
    <div className={`rental-charge-balance ${outstandingTotal > 0 ? 'due' : 'clear'}`}>
      <span><strong>{money(outstandingTotal)}</strong> due before deposit return</span>
      <small>{money(paidTotal)} additional charges paid • deposit refund is {outstandingTotal > 0 ? 'locked' : 'clear'}</small>
    </div>
    {charges.length === 0 && <small>No booking-specific charges. Add one to email the billing link automatically, send it by text, or charge the saved card.</small>}
    {automaticCharges.length > 0 && <section className="automatic-charge-section" aria-label="Automatically calculated charges">
      <div className="automatic-charge-heading">
        <div><CheckCircle2 size={17}/><span><strong>Automatically added</strong><small>No amount entry or duplicate Add charge step is needed.</small></span></div>
        {automaticCollectible.length > 0 && <div className="automatic-charge-totals">
          {automaticLateTotal > 0 && <span>Late fees <strong>{money(automaticLateTotal)}</strong></span>}
          {automaticTollTotal > 0 && <span>Tolls <strong>{money(automaticTollTotal)}</strong></span>}
          <button type="button" className="approve automatic-charge-primary" disabled={Boolean(chargingId)} onClick={chargeAllAutomatic}><CreditCard size={16}/>{chargingId === 'automatic-all' ? ' Charging card…' : `Charge saved card ${money(automaticCollectibleTotal)}`}</button>
        </div>}
      </div>
      <div className="automatic-charge-list">
        {automaticCharges.map((charge) => <article className="automatic-charge-card" key={charge.id}>
          <div className="automatic-charge-fields">
            <label><span>Charge</span><input value={charge.name || ''} readOnly /></label>
            <label><span>Type</span><input value={charge.source_type === 'tollspot' ? 'Toll • TollSpot' : 'Late fee • calculated'} readOnly /></label>
            <label><span>Amount</span><input value={Number(charge.amount || 0).toFixed(2)} readOnly /></label>
            <label><span>Total</span><input value={Number(charge.total_amount || 0).toFixed(2)} readOnly /></label>
          </div>
          <div className="automatic-charge-card-footer">
            <small>{charge.description || (charge.source_type === 'tollspot' ? 'Exact TollSpot match added automatically.' : 'Late-return assessment added automatically.')}</small>
            <span className={`workflow-badge ${charge.status === 'paid' ? 'success' : charge.status === 'waived' ? '' : 'warning'}`}>{prettyStatus(charge.status)}</span>
            {renderChargeActions(charge)}
          </div>
        </article>)}
      </div>
    </section>}
    {otherCharges.map(renderChargeRow)}
    {open && <form className="portal-form rental-charge-form" onSubmit={submit}>
      <div className="manual-charge-heading"><strong>Manual charge</strong><small>Use this only for damage, cleaning, add-ons, or another charge that was not generated automatically.</small></div>
      <label className="charge-name-field"><span>Charge</span><input value={form.name} onChange={(event) => setForm({ ...form, name: limitText(event.target.value, 120) })} placeholder="Toll, cleaning, child seat…" required /></label>
      <label className="charge-type-field"><span>Type</span><select value={form.chargeType} onChange={(event) => setForm({ ...form, chargeType: event.target.value })}><option value="toll">Toll</option><option value="add_on">Add-on</option><option value="cleaning">Cleaning</option><option value="late_fee">Late fee</option><option value="damage">Damage</option><option value="other">Other</option></select></label>
      <label className="charge-amount-field"><span>Amount</span><input type="number" min="0.50" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required /></label>
      <label className="charge-description-field"><span>Description</span><input value={form.description} onChange={(event) => setForm({ ...form, description: limitText(event.target.value, 300) })} /></label>
      <label className="checkbox-row"><input type="checkbox" checked={form.taxable} onChange={(event) => setForm({ ...form, taxable: event.target.checked })}/> Apply CT sales tax</label>
      <button className="approve" disabled={saving}>{saving ? 'Adding…' : 'Add & send to customer portal'}</button>
    </form>}
  </div>;
}

function MileageSummary({ rental }) {
  const milesDriven = rental.miles_driven ?? calculateMilesDriven(rental.starting_mileage, rental.ending_mileage);

  return <div className="mileage-summary" aria-label="Mileage summary">
    <span><strong>Pickup</strong> {formatMiles(rental.starting_mileage)}</span>
    <span><strong>Return</strong> {formatMiles(rental.ending_mileage)}</span>
    <span><strong>Driven</strong> {formatMiles(milesDriven)}</span>
  </div>;
}

function ReminderMenu({ rental, sendManualReminder }) {
  const [open, setOpen] = useState(false);

  function choose(channel) {
    setOpen(false);
    sendManualReminder(rental, channel);
  }

  return <div className="reminder-menu">
    <button type="button" onClick={() => setOpen((current) => !current)}><MessageCircle size={15}/> Contact Customer</button>
    {open && <div className="reminder-menu-popover">
      <button type="button" onClick={() => choose('SMS')}><MessageCircle size={14}/> Send SMS</button>
      <button type="button" onClick={() => choose('Email')}><Mail size={14}/> Send Email</button>
    </div>}
  </div>;
}

function RentalPaymentRefundModal({ rental, maximumAmount, previousRefunds = [], onCancel, onConfirm }) {
  const dialogRef = useDialogFocus(onCancel);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const numericAmount = Number(amount || 0);
  const valid = Number.isFinite(numericAmount)
    && numericAmount >= 0.5
    && numericAmount <= maximumAmount + 0.001
    && reason.trim().length >= 5;

  return <div className="admin-modal-backdrop" role="presentation">
    <form ref={dialogRef} className="admin-modal refund-payment-modal" role="dialog" aria-modal="true" aria-label="Refund Rental Payment" onSubmit={async (event) => {
      event.preventDefault();
      if (!valid || saving) return;
      setSaving(true);
      const submitted = await onConfirm({ amount: numericAmount, reason: reason.trim() });
      if (!submitted) setSaving(false);
    }}>
      <div className="admin-modal-header">
        <ReceiptText size={20} />
        <div>
          <strong>Refund Rental Payment</strong>
          <span>{rental.vehicles?.name || 'Vehicle'} • {rental.profiles?.full_name || 'Client'}</span>
        </div>
      </div>
      <div className="refund-protection-summary">
        <span><strong>{money(maximumAmount)}</strong> available to refund from the rental payment</span>
        <small>The held security deposit is protected and returned separately with the Refund Deposit action after inspection.</small>
      </div>
      <label className="field-label">Exact refund amount
        <input type="number" min="0.50" max={maximumAmount.toFixed(2)} step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" autoFocus required />
      </label>
      <button type="button" className="secondary-btn" onClick={() => setAmount(maximumAmount.toFixed(2))}>Use maximum {money(maximumAmount)}</button>
      <label className="field-label">Refund reason
        <textarea value={reason} minLength="5" maxLength="500" onChange={(event) => setReason(limitText(event.target.value, 500))} placeholder="Explain exactly why this amount is being refunded." required />
      </label>
      <div className="cancel-warning">
        <strong>This submits the Stripe refund immediately.</strong>
        <span>It does not cancel the rental or release its calendar reservation. Cancel or amend the rental separately if needed.</span>
      </div>
      {previousRefunds.length > 0 && <small>{previousRefunds.length} earlier refund record{previousRefunds.length === 1 ? '' : 's'} for this rental.</small>}
      <div className="mini-actions modal-actions">
        <button type="button" onClick={onCancel} disabled={saving}>Keep Payment</button>
        <button type="submit" className="approve" disabled={!valid || saving}><DollarSign size={14}/> {saving ? 'Submitting…' : `Refund ${numericAmount >= 0.5 ? money(numericAmount) : 'Amount'}`}</button>
      </div>
    </form>
  </div>;
}

function CancelRentalModal({ rental, onCancel, onConfirm }) {
  const dialogRef = useDialogFocus(onCancel);
  const [reason, setReason] = useState('');
  return <div className="admin-modal-backdrop" role="presentation">
    <form ref={dialogRef} className="admin-modal" role="dialog" aria-modal="true" aria-label="Confirm Rental Cancellation" onSubmit={(event) => {
      event.preventDefault();
      if (reason.trim().length >= 3) onConfirm(reason.trim());
    }}>
      <div className="admin-modal-header danger">
        <XCircle size={20} />
        <div>
          <strong>Cancel Rental?</strong>
          <span>{rental.vehicles?.name || 'Vehicle'} • {rental.profiles?.full_name || 'Client'}</span>
        </div>
      </div>
      <div className="cancel-warning">
        <strong>This will cancel the reservation.</strong>
        <span>The rental will no longer block the vehicle for this customer. Use this only when the booking should be stopped.</span>
      </div>
      <label className="field-label">Cancellation reason
        <textarea value={reason} minLength="3" maxLength="500" onChange={(event) => setReason(limitText(event.target.value, 500))} placeholder="For example: customer did not complete payment before the deadline." required />
      </label>
      <div className="mini-actions modal-actions">
        <button type="button" onClick={onCancel}>Keep Rental</button>
        <button type="submit" className="reject" disabled={reason.trim().length < 3}><XCircle size={14}/> Confirm Cancel</button>
      </div>
    </form>
  </div>;
}

function VehiclePriceConfirmationModal({ confirmation, error = '', confirming = false, onCancel, onConfirm }) {
  const dialogRef = useDialogFocus(onCancel);
  const isNewVehicle = confirmation.action === 'add';
  const isSingleDigit = confirmation.singleDigit;
  const title = isSingleDigit ? 'Single-Digit Price Warning' : 'Confirm Daily Rate Change';
  const descriptionId = 'vehicle-price-confirmation-description';

  return <div className="admin-modal-backdrop price-confirmation-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onCancel();
  }}>
    <div
      ref={dialogRef}
      className={`admin-modal price-confirmation-modal${isSingleDigit ? ' single-digit-warning' : ''}`}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="vehicle-price-confirmation-title"
      aria-describedby={descriptionId}
      tabIndex="-1"
    >
      <div className={`admin-modal-header${isSingleDigit ? ' danger' : ''}`}>
        {isSingleDigit ? <AlertTriangle size={22}/> : <DollarSign size={22}/>}
        <div>
          <strong id="vehicle-price-confirmation-title">{title}</strong>
          <span>{confirmation.vehicleName}</span>
        </div>
      </div>
      <div className={`price-confirmation-summary${isSingleDigit ? ' danger' : ''}`}>
        {!isNewVehicle && <div>
          <span>Current rate</span>
          <strong>{money(confirmation.previousDailyRate)}<small>/day</small></strong>
        </div>}
        {!isNewVehicle && <ArrowRight size={20} aria-hidden="true"/>}
        <div>
          <span>{isNewVehicle ? 'Entered rate' : 'New rate'}</span>
          <strong>{money(confirmation.nextDailyRate)}<small>/day</small></strong>
        </div>
      </div>
      <div id={descriptionId} className={`price-confirmation-message${isSingleDigit ? ' danger' : ''}`}>
        <strong>{isSingleDigit ? 'This price is below $10 per day.' : 'Please verify this price before saving.'}</strong>
        <span>{isSingleDigit
          ? 'Single-digit pricing is unusual and may be an accidental entry. Confirm only if this is the intended public daily rate.'
          : `This will change ${confirmation.vehicleName} from ${money(confirmation.previousDailyRate)} to ${money(confirmation.nextDailyRate)} per day.`
        }</span>
      </div>
      {error && <div className="price-confirmation-error" role="alert">
        <AlertTriangle size={17}/>
        <span>{error}</span>
      </div>}
      <div className="modal-actions price-confirmation-actions">
        <button type="button" className="secondary-btn" onClick={onCancel} disabled={confirming}>Keep Editing</button>
        <button type="button" className={isSingleDigit ? 'reject' : 'primary-btn'} onClick={onConfirm} disabled={confirming}>
          {isSingleDigit ? <AlertTriangle size={16}/> : <CheckCircle2 size={16}/>}
          {confirming ? 'Saving…' : isNewVehicle ? 'Confirm Price & Add Vehicle' : 'Confirm Price & Save'}
        </button>
      </div>
    </div>
  </div>;
}

function RentalOverrideModal({ title, actionLabel, rental, missingRequirements = [], onCancel, onConfirm }) {
  const dialogRef = useDialogFocus(onCancel);
  return <div className="admin-modal-backdrop" role="presentation">
    <div ref={dialogRef} className="admin-modal" role="dialog" aria-modal="true" aria-label={title} tabIndex="-1">
      <div className="admin-modal-header">
        <ShieldCheck size={20} />
        <div>
          <strong>{title}</strong>
          <span>{rental.vehicles?.name || 'Vehicle'} • {rental.profiles?.full_name || 'Client'}</span>
        </div>
      </div>
      <div className="override-warning">
        <strong>Automatic checklist is incomplete.</strong>
        <span>This override will be recorded in the audit log.</span>
      </div>
      <RequirementList requirements={missingRequirements} />
      <div className="mini-actions modal-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" className="override-action" onClick={onConfirm}><ShieldCheck size={14}/> {actionLabel}</button>
      </div>
    </div>
  </div>;
}

function PickupOverrideModal({ rental, defaultMileage, missingRequirements = [], override, onCancel, onConfirm }) {
  const dialogRef = useDialogFocus(onCancel);
  const [startingMileage, setStartingMileage] = useState(defaultMileage ? String(defaultMileage) : '');
  const [error, setError] = useState('');
  const currentMileage = parseMileageInput(rental?.vehicles?.current_mileage);

  function submit(event) {
    event.preventDefault();
    setError('');
    const parsedMileage = parseMileageInput(startingMileage);
    if (parsedMileage === null) {
      setError('Enter starting mileage as a whole number.');
      return;
    }
    if (currentMileage !== null && parsedMileage < currentMileage) {
      setError(`Starting mileage cannot be below current vehicle mileage (${formatMiles(currentMileage)}).`);
      return;
    }
    onConfirm(parsedMileage);
  }

  return <div className="admin-modal-backdrop" role="presentation">
    <form ref={dialogRef} className="admin-modal" role="dialog" aria-modal="true" aria-label={override ? 'Override Pickup' : 'Mark Vehicle Picked Up'} onSubmit={submit}>
      <div className="admin-modal-header">
        <Car size={20} />
        <div>
          <strong>{override ? 'Override Pickup' : 'Mark Vehicle Picked Up'}</strong>
          <span>{rental.vehicles?.name || 'Vehicle'} • {rental.profiles?.full_name || 'Client'}</span>
        </div>
      </div>
      {override && <>
        <div className="override-warning">
          <strong>Automatic checklist is incomplete.</strong>
          <span>This will bypass the missing step(s), mark the rental active, and log the override.</span>
        </div>
        <RequirementList requirements={missingRequirements} />
      </>}
      <label className="field-label modal-field">Starting mileage
        <input type="number" min={currentMileage || 0} max={MILEAGE_MAX} step="1" inputMode="numeric" title={`Whole-number mileage, max ${MILEAGE_MAX.toLocaleString('en-US')}.`} value={startingMileage} onChange={(event) => setStartingMileage(event.target.value)} autoFocus required />
      </label>
      {currentMileage !== null && <small className="modal-hint">Current vehicle mileage: {formatMiles(currentMileage)}</small>}
      {error && <small className="form-error">{error}</small>}
      <div className="mini-actions modal-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className={override ? 'override-action' : 'approve'}><Car size={14}/> {override ? 'Override Pickup' : 'Mark Picked Up'}</button>
      </div>
    </form>
  </div>;
}

function RequirementList({ requirements = [] }) {
  return <div className="requirement-list">
    <strong>Missing required step{requirements.length === 1 ? '' : 's'}</strong>
    {(requirements.length ? requirements : ['automatic checklist requirement']).map((requirement) => (
      <span key={requirement}><AlertTriangle size={14}/> {prettyStatus(requirement)}</span>
    ))}
  </div>;
}

function RentalExtensionActions({ requests = [], documents = [], vehicles = [], decideExtension, recordExtensionPayment, cancelApprovedExtension, sendExtensionPaymentLink, openDocument, markDocument }) {
  const activeRequests = requests
    .filter((request) => ['pending', 'approved_pending_payment', 'activated', 'rejected'].includes(request.status))
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));

  if (!activeRequests.length) return null;

  return <div className="rental-extension-actions">
    <strong>Extension / Switch Requests</strong>
    {activeRequests.map((request) => {
      const replacement = vehicles.find((vehicle) => vehicle.id === request.replacement_vehicle_id);
      const isSwitch = request.request_kind === 'switch_car_continuation';
      const extensionInsurance = documents
        .filter((document) =>
          document.document_type === 'insurance' &&
          document.extension_request_id === request.id
        )
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
      const insuranceApproved = extensionInsurance?.status === 'approved';
      return <div className={`extension-action-row ${request.status}`} key={request.id}>
        <div>
          <span>{isSwitch ? 'Switch vehicle continuation' : 'Same vehicle extension'} • {prettyStatus(request.status)}</span>
          <small>
            {isSwitch && replacement ? `${replacement.name} • ` : ''}
            Requested return {formatRentalDate(request.requested_return_date, request.requested_return_time)}
            {request.extension_total_amount ? ` • ${money(request.extension_total_amount)} due` : ''}
          </small>
          {isSwitch && request.status !== 'pending' && <small>{money(request.deposit_carried_amount || 0)} deposit carried{Number(request.deposit_increase_amount || 0) > 0 ? ` • ${money(request.deposit_increase_amount)} increase collected` : ''}{Number(request.deposit_decrease_amount || 0) > 0 ? ` • ${money(request.deposit_decrease_amount)} decrease refunded after original-car inspection` : ''}</small>}
          {request.status === 'approved_pending_payment' && <small>Customer notice: email {request.approval_email_queued_at ? 'queued' : 'not queued'} • SMS {prettyStatus(request.approval_sms_status || 'not due')}</small>}
          <small className={insuranceApproved ? 'extension-insurance-approved' : 'form-error'}>
            Extension insurance: {prettyStatus(extensionInsurance?.status || 'missing')}
          </small>
          {request.customer_note && <small>Note: {request.customer_note}</small>}
        </div>
        <div className="mini-actions">
          {extensionInsurance && openDocument && <button type="button" onClick={() => openDocument(extensionInsurance)}><FileText size={14}/> Open Insurance</button>}
          {extensionInsurance && extensionInsurance.status !== 'approved' && markDocument && <button type="button" className="approve" onClick={() => markDocument(extensionInsurance.id, 'approved')}><CheckCircle2 size={14}/> Approve Insurance</button>}
          {request.status === 'pending' && decideExtension && <button type="button" className="approve" disabled={!insuranceApproved} title={!insuranceApproved ? 'Approve the new extension insurance first.' : undefined} onClick={() => decideExtension(request.id, true)}><CheckCircle2 size={14}/> Approve &amp; Notify Customer</button>}
          {request.status === 'pending' && decideExtension && <button type="button" className="reject" onClick={() => decideExtension(request.id, false)}><XCircle size={14}/> Reject</button>}
          {request.status === 'approved_pending_payment' && recordExtensionPayment && <button type="button" className="approve" onClick={() => recordExtensionPayment(request.id)}><CreditCard size={14}/> Record Payment</button>}
          {request.status === 'approved_pending_payment' && sendExtensionPaymentLink && <button type="button" onClick={() => sendExtensionPaymentLink(request)}><Send size={14}/> Send Payment Link</button>}
          {request.status === 'approved_pending_payment' && cancelApprovedExtension && <button type="button" className="reject" onClick={() => cancelApprovedExtension(request.id)}><XCircle size={14}/> Cancel Hold</button>}
        </div>
      </div>;
    })}
  </div>;
}

function DamageReportList({ reports = [] }) {
  return <div className="damage-report-list">
    <strong>Damage / Incident Reports</strong>
    {reports.map((report) => (
      <div className="damage-report-row" key={report.id}>
        <span>{prettyStatus(report.status || 'open')}</span>
        <small>{report.description || 'Damage report open for this rental.'}</small>
      </div>
    ))}
  </div>;
}

function DamageCases({ reports = [], updateDamageCase, setCustomerStatus }) {
  const [filter, setFilter] = useState('open');
  const cases = reports.filter((report) => {
    if (filter === 'all') return true;
    if (filter === 'blocked') return report.profiles?.blocked_customer || report.profiles?.customer_status === 'blocked';
    if (filter === 'deposit_held') return Number(report.deposit_held_amount || 0) > 0 || report.rentals?.deposit_status === 'held';
    return String(report.status || 'open').toLowerCase() === filter;
  });

  return <Panel title="Damage & Incident Cases" eyebrow="Fleet Protection">
    <div className="filter-pills">
      {[
        ['open', 'Open'],
        ['deposit_held', 'Deposit Held'],
        ['resolved', 'Resolved'],
        ['blocked', 'Blocked Customers'],
        ['all', 'All'],
      ].map(([key, label]) => <button type="button" key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>)}
    </div>
    <div className="table-list">
      {cases.length === 0 && <p className="muted">No damage cases in this view.</p>}
      {cases.map((report) => <DamageCaseRow key={report.id} report={report} updateDamageCase={updateDamageCase} setCustomerStatus={setCustomerStatus} />)}
    </div>
  </Panel>;
}

function DamageCaseRow({ report, updateDamageCase, setCustomerStatus }) {
  const [form, setForm] = useState({
    description: report.description || '',
    admin_notes: report.admin_notes || '',
    estimated_cost: report.estimated_cost || '',
    final_charge_amount: report.final_charge_amount || '',
    deposit_held_amount: report.deposit_held_amount || '',
  });
  const blocked = report.profiles?.blocked_customer || report.profiles?.customer_status === 'blocked';

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  return <div className="data-row damage-case-card">
    <div>
      <strong>{report.rentals?.vehicles?.name || 'Vehicle'} • {prettyStatus(report.issue_type || report.report_type || 'Damage')}</strong>
      <span>{report.profiles?.full_name || report.user_id || 'Customer'} • {prettyStatus(report.status || 'open')}</span>
      <small>{report.rentals ? `${formatRentalDate(report.rentals.pickup_date, report.rentals.pickup_time)} → ${formatRentalDate(report.rentals.return_date, report.rentals.return_time)}` : 'No rental attached'}</small>
      <div className="damage-case-form">
        <textarea value={form.description} maxLength="1000" onChange={(event) => update('description', limitText(event.target.value, 1000))} placeholder="Damage description" />
        <textarea value={form.admin_notes} maxLength="1500" onChange={(event) => update('admin_notes', limitText(event.target.value, 1500))} placeholder="Admin notes, estimate details, customer communication..." />
        <input type="number" step="0.01" min="0" max={MONEY_MAX} inputMode="decimal" title="Estimated repair cost in USD." value={form.estimated_cost} onChange={(event) => update('estimated_cost', event.target.value)} placeholder="$0.00 estimated cost" />
        <input type="number" step="0.01" min="0" max={MONEY_MAX} inputMode="decimal" title="Final customer charge in USD." value={form.final_charge_amount} onChange={(event) => update('final_charge_amount', event.target.value)} placeholder="$0.00 final charge" />
        <input type="number" step="0.01" min="0" max={MONEY_MAX} inputMode="decimal" title="Deposit amount held in USD." value={form.deposit_held_amount} onChange={(event) => update('deposit_held_amount', event.target.value)} placeholder="$0.00 deposit held" />
      </div>
    </div>
    <div className="row-actions">
      <span className={`workflow-badge ${report.status === 'resolved' ? 'success' : 'danger'}`}>{prettyStatus(report.status || 'open')}</span>
      {blocked && <span className="workflow-badge danger">Blocked</span>}
      <button className="approve" onClick={() => updateDamageCase(report.id, {
        description: form.description,
        admin_notes: form.admin_notes,
        estimated_cost: Number(form.estimated_cost || 0),
        final_charge_amount: Number(form.final_charge_amount || 0),
        deposit_held_amount: Number(form.deposit_held_amount || 0),
      })}><CheckCircle2 size={15}/> Save Case</button>
      <button onClick={() => updateDamageCase(report.id, { status: 'resolved' })}><CheckCircle2 size={15}/> Mark Resolved</button>
      {report.user_id && <button className="reject" onClick={() => setCustomerStatus(report.user_id, 'blocked', form.admin_notes || form.description || 'Damage case')}><XCircle size={15}/> Block Customer</button>}
      {report.user_id && blocked && <button onClick={() => setCustomerStatus(report.user_id, 'good', '')}><CheckCircle2 size={15}/> Unblock</button>}
    </div>
  </div>;
}

const ACTIVE_RETURN_RENTAL_KEY = 'rentmect_admin_active_return_rental';
const RETURN_DRAFT_PREFIX = 'rentmect_admin_return_draft:';

function returnDraftKey(rentalId) {
  return `${RETURN_DRAFT_PREFIX}${rentalId}`;
}

function readActiveReturnRentalId() {
  try {
    return window.localStorage.getItem(ACTIVE_RETURN_RENTAL_KEY) || '';
  } catch {
    return '';
  }
}

function setActiveReturnRentalId(rentalId) {
  try {
    window.localStorage.setItem(ACTIVE_RETURN_RENTAL_KEY, rentalId);
  } catch {
    // The open React state still works when private storage is unavailable.
  }
}

function readReturnDraft(rentalId) {
  try {
    return JSON.parse(window.localStorage.getItem(returnDraftKey(rentalId)) || 'null') || {};
  } catch {
    return {};
  }
}

function saveReturnDraft(rentalId, inspection) {
  try {
    const { files: _files, ...serializableInspection } = inspection;
    window.localStorage.setItem(returnDraftKey(rentalId), JSON.stringify(serializableInspection));
    window.localStorage.setItem(ACTIVE_RETURN_RENTAL_KEY, rentalId);
  } catch {
    // Do not block a return when browser storage is unavailable.
  }
}

function clearReturnDraft(rentalId) {
  try {
    window.localStorage.removeItem(returnDraftKey(rentalId));
    if (window.localStorage.getItem(ACTIVE_RETURN_RENTAL_KEY) === rentalId) {
      window.localStorage.removeItem(ACTIVE_RETURN_RENTAL_KEY);
    }
  } catch {
    // Nothing else is required when storage is unavailable.
  }
}

function externalPaymentMethodLabel(method) {
  return {
    card: 'Card',
    cash_app: 'Cash App',
    cash: 'Cash',
  }[method] || 'External';
}

function ExternalPaymentModal({ rental, onCancel, onConfirm }) {
  const dialogRef = useDialogFocus(onCancel);
  const amountDue = Number(rental.rental_total || 0)
    + Number(rental.service_fee_total || 0)
    + Number(rental.tax_amount || 0)
    + Number(rental.security_deposit || 0);
  const [form, setForm] = useState({
    amount: amountDue.toFixed(2),
    paymentMethod: '',
    confirmed: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter the actual external payment amount received.');
      return;
    }
    if (Math.abs(amount - amountDue) > 0.005) {
      setError(`The recorded payment must equal the full amount due: ${money(amountDue)}.`);
      return;
    }
    if (!['card', 'cash_app', 'cash'].includes(form.paymentMethod)) {
      setError('Choose Card, Cash App, or Cash.');
      return;
    }
    if (!form.confirmed) {
      setError('Confirm that the external payment cleared before recording it.');
      return;
    }
    setSaving(true);
    const recorded = await onConfirm?.({ amount, paymentMethod: form.paymentMethod });
    setSaving(false);
    if (!recorded) setError('The payment was not recorded. Review the message above and try again.');
  }

  return createPortal(<div className="admin-modal-backdrop external-payment-backdrop">
    <form ref={dialogRef} className="admin-modal external-payment-modal" role="dialog" aria-modal="true" aria-labelledby={`external-payment-title-${rental.id}`} onSubmit={submit}>
      <header className="admin-modal-header">
        <DollarSign size={28}/>
        <div>
          <strong id={`external-payment-title-${rental.id}`}>Record External Payment</strong>
          <span>{rental.vehicles?.name || 'Vehicle'} • {rental.profiles?.full_name || rental.customer_name_snapshot || 'Customer'}</span>
        </div>
      </header>
      <div className="external-payment-total">
        <span>Full amount due</span>
        <strong>{money(amountDue)}</strong>
      </div>
      <label className="modal-field">
        <span>Actual amount received</span>
        <div className="money-input-shell"><span>$</span><input type="number" min="0.01" max={MONEY_MAX} step="0.01" inputMode="decimal" value={form.amount} onFocus={(event) => event.target.select()} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} required /></div>
      </label>
      <label className="modal-field">
        <span>Payment type</span>
        <select value={form.paymentMethod} onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value }))} required>
          <option value="">Choose payment type</option>
          <option value="card">Card</option>
          <option value="cash_app">Cash App</option>
          <option value="cash">Cash</option>
        </select>
      </label>
      <div className="override-warning">
        <strong>Record only money that actually cleared</strong>
        <span>This action marks the rental payment and security deposit as received outside Stripe and creates an admin audit record.</span>
      </div>
      <label className="external-payment-confirmation">
        <input type="checkbox" checked={form.confirmed} onChange={(event) => setForm((current) => ({ ...current, confirmed: event.target.checked }))} />
        <span>I confirm this payment was received and cleared.</span>
      </label>
      {error && <small className="form-error" role="alert">{error}</small>}
      <div className="modal-actions">
        <button type="button" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="approve" disabled={saving}><CheckCircle2 size={16}/>{saving ? ' Recording…' : ' Record Payment'}</button>
      </div>
    </form>
  </div>, document.body);
}

function ReturnCompletionPanel({ rental, onCancel, onComplete }) {
  const dialogRef = useDialogFocus(onCancel, { closeOnEscape: false });
  const [inspection, setInspection] = useState(() => ({
    mileageChecked: false,
    endingMileage: rental.ending_mileage || rental.vehicles?.current_mileage || rental.starting_mileage || '',
    mileageOverride: false,
    fuelChecked: false,
    damageChecked: false,
    damageFound: false,
    issueType: 'damage',
    depositDecision: 'release',
    damageNote: '',
    customerAction: 'review',
    vehicleDisposition: 'available',
    files: [],
    ...readReturnDraft(rental.id),
    files: [],
  }));
  const [saving, setSaving] = useState(false);
  const [mileageError, setMileageError] = useState('');
  const milesDriven = inspection.mileageOverride ? null : calculateMilesDriven(rental.starting_mileage, inspection.endingMileage);

  useEffect(() => {
    saveReturnDraft(rental.id, inspection);
  }, [inspection, rental.id]);

  async function submit(event) {
    event.preventDefault();
    setMileageError('');
    const endingMileage = parseMileageInput(inspection.endingMileage);
    if (!inspection.mileageOverride && endingMileage === null) {
      setMileageError('Enter the ending mileage as a whole number.');
      return;
    }
    if (!inspection.mileageOverride && rental.starting_mileage !== null && rental.starting_mileage !== undefined && endingMileage < Number(rental.starting_mileage)) {
      setMileageError(`Ending mileage cannot be below pickup mileage (${formatMiles(rental.starting_mileage)}).`);
      return;
    }
    if ((!inspection.mileageOverride && !inspection.mileageChecked) || !inspection.fuelChecked || !inspection.damageChecked) {
      setMileageError('Complete the required mileage, fuel, and condition checks before closing the rental.');
      return;
    }
    if ((inspection.damageFound || inspection.depositDecision === 'hold') && inspection.damageNote.trim().length < 5) {
      setMileageError('Add a note explaining the damage or deposit hold.');
      return;
    }
    setSaving(true);
    const completed = await onComplete(inspection);
    setSaving(false);
    if (completed) onCancel();
  }

  const update = (key, value) => setInspection((current) => ({ ...current, [key]: value }));

  return createPortal(<div className="admin-modal-backdrop return-completion-backdrop">
  <form ref={dialogRef} className="admin-modal return-completion-panel return-completion-modal" role="dialog" aria-modal="true" aria-labelledby={`return-completion-title-${rental.id}`} onSubmit={submit}>
    <header className="admin-modal-header">
      <Car size={28}/>
      <div>
        <strong id={`return-completion-title-${rental.id}`}>Return Completion</strong>
        <span>{rental.vehicles?.name || 'Vehicle'} • {rental.profiles?.full_name || 'Client'}</span>
      </div>
    </header>
    <section className={`return-mileage-card${inspection.mileageOverride ? ' override-active' : ''}`}>
      <label className="field-label return-mileage-field"><span>Ending mileage</span>
        <input type="number" min={rental.starting_mileage || 0} max={MILEAGE_MAX} step="1" inputMode="numeric" placeholder="Enter the return odometer mileage" title={`Whole-number mileage, max ${MILEAGE_MAX.toLocaleString('en-US')}.`} value={inspection.endingMileage} disabled={inspection.mileageOverride} onChange={(event) => setInspection((current) => ({ ...current, endingMileage: event.target.value, mileageChecked: Boolean(event.target.value), mileageOverride: false }))} required={!inspection.mileageOverride} />
      </label>
      <button type="button" className={`return-mileage-override-button${inspection.mileageOverride ? ' active' : ''}`} aria-pressed={inspection.mileageOverride} onClick={() => setInspection((current) => ({ ...current, mileageOverride: !current.mileageOverride, mileageChecked: current.mileageOverride ? Boolean(current.endingMileage) : false }))}>
        <AlertTriangle size={16}/>{inspection.mileageOverride ? 'Use mileage input instead' : 'Admin override — skip mileage'}
      </button>
      {inspection.mileageOverride && <div className="return-mileage-override-warning" role="alert"><AlertTriangle size={20}/><span><strong>Mileage is being skipped.</strong> Tracking maintenance will be difficult. Make sure to input the returning mileage as soon as possible.</span></div>}
    </section>
    {mileageError && <small className="form-error">{mileageError}</small>}
    {rental.starting_mileage !== null && rental.starting_mileage !== undefined && <small className="return-mileage-summary">Pickup mileage: {formatMiles(rental.starting_mileage)} • Miles driven: {inspection.mileageOverride ? 'Not recorded' : formatMiles(milesDriven)}</small>}
    <div className="return-required-checks">
      <strong>Required release checks</strong>
      <label className={inspection.mileageOverride ? 'override-check' : ''}><input type="checkbox" checked={inspection.mileageChecked} disabled={inspection.mileageOverride} onChange={(event) => update('mileageChecked', event.target.checked)} /> {inspection.mileageOverride ? 'Mileage skipped by admin override' : 'Mileage recorded and verified'}</label>
      <label><input type="checkbox" checked={inspection.fuelChecked} onChange={(event) => update('fuelChecked', event.target.checked)} /> Fuel level inspected</label>
      <label><input type="checkbox" checked={inspection.damageChecked} onChange={(event) => update('damageChecked', event.target.checked)} /> Exterior/interior condition inspected</label>
    </div>
      <label className="field-label">Deposit decision
        <select value={inspection.depositDecision} onChange={(event) => update('depositDecision', event.target.value)}>
          <option value="release">Schedule refund in 7 days (admin can refund sooner)</option>
          <option value="hold">Hold deposit for review</option>
        </select>
      </label>
      <label><input type="checkbox" checked={inspection.damageFound} onChange={(event) => setInspection((current) => ({
        ...current,
        damageFound: event.target.checked,
        depositDecision: event.target.checked ? 'hold' : current.depositDecision,
        vehicleDisposition: event.target.checked ? 'maintenance' : 'available',
      }))} /> Damage or incident found</label>
      <label className="field-label">Vehicle after inspection
        <select value={inspection.vehicleDisposition} onChange={(event) => update('vehicleDisposition', event.target.value)}>
          <option value="available">Available — clean and ready to rent</option>
          <option value="maintenance">Maintenance — repair/service required</option>
          <option value="unavailable">Unavailable — manual review required</option>
        </select>
      </label>
      {inspection.damageFound && <>
        <label className="field-label">Case type
          <select value={inspection.issueType} onChange={(event) => update('issueType', event.target.value)}>
            <option value="damage">Damage</option>
            <option value="late_return">Late Return</option>
            <option value="fuel">Fuel Issue</option>
            <option value="cleaning">Cleaning Issue</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="field-label">Customer status
          <select value={inspection.customerAction} onChange={(event) => update('customerAction', event.target.value)}>
            <option value="review">Review Required</option>
            <option value="block">Block Customer</option>
            <option value="none">No Customer Flag</option>
          </select>
        </label>
      </>}
      {(inspection.damageFound || inspection.depositDecision === 'hold') && <>
        <label className="field-label return-damage-notes"><span>Damage / incident notes <strong>Required</strong></span>
          <textarea value={inspection.damageNote} maxLength="1000" onChange={(event) => update('damageNote', limitText(event.target.value, 1000))} placeholder="Clearly describe the damage, where it is located, when it was found, and any customer explanation..." />
          <small>These notes are saved to the damage case and used during the deposit review.</small>
        </label>
        <label className="field-label return-evidence-upload"><span>Damage photos or documents</span><input type="file" multiple accept="image/*,application/pdf" onChange={(event) => update('files', Array.from(event.target.files || []))} /></label>
      </>}
    <div className="modal-actions">
      <button type="button" onClick={onCancel}>Cancel</button>
      <button type="submit" className="approve" disabled={saving}><CheckCircle2 size={14}/> {saving ? 'Closing...' : 'Close Rental'}</button>
    </div>
  </form>
  </div>, document.body);
}

function RentalProgressTracker({ steps, onStepClick }) {
  const icons = {
    phone: ShieldCheck,
    vehicle: Car,
    agreement: FileSignature,
    payment: CreditCard,
    license: FileText,
    insurance: ShieldCheck,
    identity: UserRound,
    deposit: DollarSign,
    ready: CheckCircle2,
  };

  return <div className="rental-progress-tracker" aria-label="Rental progress">
    {steps.map((step) => {
      const Icon = icons[step.key] || CheckCircle2;
      const interactive = step.adminAction && onStepClick;
      const interactiveLabel = `${step.label}: ${step.detail}. Click to manage or complete this step.`;
      return <div className="progress-step-wrap" key={step.key}>
          {interactive
            ? <button type="button" className={`progress-step ${step.state} interactive`} title={interactiveLabel} aria-label={`Manage ${step.label}`} onClick={() => onStepClick(step)}>
                <Icon size={16}/>
              </button>
            : <div className={`progress-step ${step.state}`} title={`${step.label}: ${step.detail}`}>
                {step.complete ? <CheckCircle2 size={16}/> : step.bypassed ? <AlertTriangle size={16}/> : <Icon size={16}/>}
              </div>}
          <span>{step.label}</span>
        </div>;
    })}
  </div>;
}

function DocumentStatusBadge({ label, document }) {
  const status = document?.status || 'missing';
  return <span className={`doc-status-badge ${status}`}>{label}: {prettyStatus(status)}</span>;
}

function DocumentMiniList({ documents = [], openDocument, markDocument, deleteDocument }) {
  if (!documents.length) return <div className="document-mini-list empty">No license or insurance uploads yet.</div>;

  return <div className="document-mini-list">
    {documents.map((document) => <div className="document-mini-row" key={document.id}>
      <span>{document.extension_request_id ? 'Extension Insurance' : docLabel(document.document_type)} • {prettyStatus(document.status)}</span>
      <div className="mini-actions">
        {openDocument && <button type="button" onClick={() => openDocument(document)}><FileText size={14}/> Open</button>}
        {markDocument && document.status !== 'approved' && <button type="button" className="approve" onClick={() => markDocument(document.id, 'approved')}><CheckCircle2 size={14}/> Approve</button>}
        {markDocument && document.status !== 'rejected' && <button type="button" className="reject" onClick={() => markDocument(document.id, 'rejected')}><XCircle size={14}/> Reject</button>}
        {deleteDocument && <button type="button" className="reject" onClick={() => deleteDocument(document)}><XCircle size={14}/> Delete</button>}
      </div>
    </div>)}
  </div>;
}

function Panel({ title, eyebrow, children }) { return <section className="panel"><p className="eyebrow">{eyebrow}</p><h3>{title}</h3>{children}</section>; }
function Metric({ icon: Icon, label, value, danger }) { return <div className={danger ? 'metric-card danger' : 'metric-card'}><Icon size={22}/><span>{label}</span><strong>{value}</strong></div>; }
function QueueItem({ icon: Icon, label, value }) { return <div className="queue-item"><Icon size={18}/><span>{label}</span><strong>{value}</strong></div>; }
function Loading({ message = 'Loading admin portal…' }) {
  return <div className="loading-screen" role="status" aria-live="polite" aria-busy="true">
    <div className="loading-status-card">
      <div className="admin-access-spinner" aria-hidden="true">
        <span />
      </div>
      <h1>{message}</h1>
      <p>Please keep this page open.</p>
    </div>
  </div>;
}
function Login({ authForm, setAuthForm, handleLogin, authMessage, showPassword, setShowPassword, handleForgotPassword }) {
  return <div className="auth-screen admin-auth-light">
    <form className="auth-card" onSubmit={handleLogin}>
      <img className="auth-logo" src={logoMobileUrl} alt="Rent Me CT" />
      <span className="auth-portal-label">Admin</span>
      <input type="email" placeholder="Admin email" maxLength="254" value={authForm.email} onChange={(e)=>setAuthForm({...authForm, email:limitText(e.target.value, 254)})} required/>
      <div className="password-field">
        <input type={showPassword ? 'text' : 'password'} placeholder="Password" maxLength="128" value={authForm.password} onChange={(e)=>setAuthForm({...authForm, password:limitText(e.target.value, 128)})} required/>
        <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
          {showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}
        </button>
      </div>
      <button className="primary-btn">Sign In</button>
      <button className="link-btn" type="button" onClick={handleForgotPassword}>Forgot password?</button>
      <span className="auth-symbolic-line">Liv to drive</span>
      {authMessage && <p className="auth-message">{authMessage}</p>}
    </form>
  </div>;
}
function NotAdmin({ email, signOut }) {
  return <div className="auth-screen">
    <div className="auth-card">
      <h2>Not Authorized</h2>
      <p className="muted">{email} is signed in, but this account does not have administrator access.</p>
      <div className="auth-help-box"><strong>Need access?</strong><span>Contact the Rent Me CT account owner and ask them to verify your administrator role.</span></div>
      <button className="primary-btn" onClick={signOut}>Log Out</button>
    </div>
  </div>;
}
function Notice({ notice, onDismiss }) {
  const isError = notice.type === 'error';
  const isUpdate = notice.type === 'update';
  const Icon = isError || isUpdate ? AlertTriangle : CheckCircle2;
  return <div className={`notice-banner ${notice.type || 'info'}`} role={isError ? 'alert' : 'status'} aria-live={isError ? 'assertive' : 'polite'} aria-atomic="true">
    <Icon className="notice-icon" size={21} aria-hidden="true" />
    <span>{notice.text}</span>
    <div className="notice-controls">
      {notice.action && <button type="button" className="notice-action" onClick={notice.action.onClick}>{notice.action.label}</button>}
      <button type="button" className="notice-dismiss admin-close-button" onClick={onDismiss} aria-label="Dismiss notification"><X size={17}/></button>
    </div>
  </div>;
}

function PortalDataHealth({ health, onRetry, audience = 'portal' }) {
  if (!health?.errors?.length && !health?.refreshing) return null;
  const lastUpdated = health.lastUpdated ? new Date(health.lastUpdated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  if (!health.errors.length) {
    return <div className="portal-data-health refreshing" role="status" aria-live="polite"><Clock size={18}/><span>Refreshing live data{lastUpdated ? ` • last updated ${lastUpdated}` : ''}…</span></div>;
  }
  const labels = health.errors.map((item) => item.label);
  return <section className="portal-data-health error" role="alert" aria-live="assertive">
    <AlertTriangle size={20}/>
    <div>
      <strong>Some {audience} data could not refresh</strong>
      <span>{labels.join(', ')} may be incomplete{lastUpdated ? `. Last refresh attempt: ${lastUpdated}.` : '.'} Existing records have not been changed.</span>
      <details><summary>View details</summary><ul>{health.errors.map((item) => <li key={item.label}><strong>{item.label}:</strong> {item.message} <button type="button" onClick={() => onRetry(item.label)} disabled={health.refreshing}>Retry section</button></li>)}</ul></details>
    </div>
    <button type="button" className="secondary-btn" onClick={() => health.errors.forEach((item) => onRetry(item.label))} disabled={health.refreshing}>{health.refreshing ? 'Retrying…' : 'Retry failed data'}</button>
  </section>;
}

function userFacingPortalError(error, fallback = 'Something went wrong. Please try again.') {
  const message = String(error?.message || error || '').trim();
  if (!message) return fallback;
  if (/failed to fetch|network|load failed|connection|timeout/i.test(message)) return 'The connection was interrupted. Check your internet connection and try again.';
  if (/jwt|token|session|not authenticated/i.test(message)) return 'Your secure session needs to be refreshed. Sign in again and retry.';
  if (/row-level security|\\brls\\b|schema cache|relation .* does not exist|function .* does not exist|policy/i.test(message)) return fallback;
  if (/duplicate key|already exists/i.test(message)) return 'That change was already recorded. Refresh to see the latest status.';
  return fallback;
}

function useDialogFocus(onClose, { closeOnEscape = true } = {}) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const dialog = dialogRef.current;
    document.body.style.overflow = 'hidden';
    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    window.requestAnimationFrame(() => dialog?.querySelector(focusableSelector)?.focus());

    function handleKeyDown(event) {
      if (event.key === 'Escape' && closeOnEscape) {
        event.preventDefault();
        closeRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll(focusableSelector)].filter((element) => element.offsetParent !== null);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [closeOnEscape]);

  return dialogRef;
}

class PortalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Admin portal render failure', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <div className="portal-fatal-state" role="alert">
      <AlertTriangle size={34}/>
      <h1>This admin view could not be displayed.</h1>
      <p>No rental data was changed. Refresh the portal to reload the latest records.</p>
      <button type="button" className="primary-btn" onClick={() => window.location.reload()}>Refresh admin portal</button>
    </div>;
  }
}

function availabilityTableError(error) {
  const message = error?.message || String(error || 'Unable to save availability block.');
  if (message.includes('vehicle_availability_blocks') && message.includes('schema cache')) {
    return 'Supabase is missing public.vehicle_availability_blocks. Run supabase/admin_pricing_settings.sql in Supabase, then refresh the admin portal.';
  }
  return message;
}

function sitePromotionTableError(error) {
  const message = error?.message || String(error || 'Unable to save website promotion.');
  if (message.includes('site_promotions') && (message.includes('schema cache') || message.includes('does not exist'))) {
    return 'Supabase is missing public.site_promotions. Run supabase/site_promotions.sql in Supabase, then refresh the admin portal.';
  }
  return message;
}

function linesToList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function limitText(value, maxLength) {
  return String(value || '').slice(0, maxLength);
}

function joinLegalName(firstName, lastName) {
  return [firstName, lastName]
    .map((part) => String(part || '').trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join(' ');
}

function isValidUSPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
}

function normalizeVinInput(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-HJ-NPR-Z0-9]/g, '')
    .slice(0, VIN_MAX_LENGTH);
}

function normalizePlateInput(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9 -]/g, '')
    .slice(0, PLATE_MAX_LENGTH);
}

function normalizeCodeInput(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 24);
}

function listToLines(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join('\n');
  return String(value || '');
}

function datesOverlap(start1, end1, start2, end2) { return new Date(start1) <= new Date(end2) && new Date(end1) >= new Date(start2); }
function parseRentMeCtDateTime(dateValue, timeValue = '9:00 AM') {
  if (!dateValue) return null;
  const match = String(timeValue || '9:00 AM').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return new Date(`${dateValue}T09:00:00`);

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3].toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  return new Date(`${dateValue}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
}
function rentalPeriodsOverlap(reservation, rental) {
  const requestedStart = parseRentMeCtDateTime(reservation?.pickupDate, reservation?.pickupTime);
  const requestedEnd = parseRentMeCtDateTime(reservation?.returnDate, reservation?.returnTime);
  const bookedStart = parseRentMeCtDateTime(rental?.pickup_date, rental?.pickup_time);
  const bookedEnd = parseRentMeCtDateTime(rental?.return_date, rental?.return_time);

  if (!requestedStart || !requestedEnd || !bookedStart || !bookedEnd) return false;

  const blockedUntil = getTurnaroundBlockedUntil(bookedEnd, rental);
  const requestedBlockedUntil = new Date(requestedEnd.getTime() + TURNAROUND_BUFFER_MINUTES * 60 * 1000);
  return requestedStart < blockedUntil && requestedBlockedUntil > bookedStart;
}
function availabilityBlockOverlapsReservation(block, reservation) {
  const requestedStart = parseRentMeCtDateTime(reservation?.pickupDate, reservation?.pickupTime);
  const requestedEnd = parseRentMeCtDateTime(reservation?.returnDate, reservation?.returnTime);
  const blockStart = parseRentMeCtDateTime(block?.start_date, block?.start_time || '12:00 AM');
  const blockEnd = getAvailabilityBlockBlockedUntil(block);
  if (!requestedStart || !requestedEnd || !blockStart || !blockEnd) return false;
  return requestedStart < blockEnd && requestedEnd > blockStart;
}
function manualBookingVehicleAvailability(vehicle, reservation, rentals = [], availabilityBlocks = [], windowReady = false) {
  const vehicleStatus = String(vehicle?.status || 'available').toLowerCase();
  if (BLOCKING_VEHICLE_STATUSES.includes(vehicleStatus)) {
    return { available: false, reason: prettyVehicleStatus(vehicleStatus) };
  }
  if (!windowReady) return { available: false, reason: 'Choose dates first' };

  const physicalReturnLock = rentals.find((rental) =>
    rental.vehicle_id === vehicle.id &&
    requiresPhysicalReturnLock(rental)
  );
  if (physicalReturnLock) {
    return { available: false, reason: 'Physical return and inspection required' };
  }

  const conflictingRental = rentals.find((rental) =>
    rental.vehicle_id === vehicle.id &&
    AVAILABILITY_RENTAL_STATUSES.includes(String(rental.status || '').toLowerCase()) &&
    rentalPeriodsOverlap(reservation, rental)
  );
  if (conflictingRental) {
    const status = String(conflictingRental.status || '').toLowerCase();
    const reason = ['active', 'overdue', 'return_initiated'].includes(status) ? 'On the road during selected time' : 'Reserved during selected time';
    return { available: false, reason };
  }

  const conflictingBlock = availabilityBlocks.find((block) =>
    block.vehicle_id === vehicle.id &&
    block.active !== false &&
    String(block.block_type || 'unavailable').toLowerCase() !== 'available' &&
    availabilityBlockOverlapsReservation(block, reservation)
  );
  if (conflictingBlock) return { available: false, reason: conflictingBlock.label || prettyStatus(conflictingBlock.block_type || 'Calendar block') };

  return { available: true, reason: 'Available' };
}
function getRentalBlockedUntil(rental) {
  const bookedEnd = parseRentMeCtDateTime(rental?.return_date, rental?.return_time);
  if (!bookedEnd) return null;
  return getTurnaroundBlockedUntil(bookedEnd, rental);
}
function getAvailabilityBlockBlockedUntil(block) {
  const blockEnd = parseRentMeCtDateTime(block?.end_date, block?.end_time || '11:59 PM');
  if (!blockEnd) return null;
  const type = String(block?.block_type || '').toLowerCase();
  if (!['reserved', 'on_road'].includes(type)) return blockEnd;
  return getTurnaroundBlockedUntil(blockEnd, block);
}
function getTurnaroundBlockedUntil(dueAt, item) {
  return new Date(dueAt.getTime() + TURNAROUND_BUFFER_MINUTES * 60 * 1000);
}
function rentalBlocksCalendarDay(rental, dayStart, dayEnd) {
  const bookedStart = parseRentMeCtDateTime(rental?.pickup_date, rental?.pickup_time);
  const blockedUntil = getRentalBlockedUntil(rental);
  if (!bookedStart || !blockedUntil) return false;
  return dayStart < blockedUntil && dayEnd > bookedStart;
}
function availabilityBlockTouchesDay(block, dayStart, dayEnd) {
  const blockStart = parseRentMeCtDateTime(block?.start_date, block?.start_time || '12:00 AM');
  const blockEnd = parseRentMeCtDateTime(block?.end_date, block?.end_time || '11:59 PM');
  if (!blockStart || !blockEnd) return false;
  return dayStart < blockEnd && dayEnd > blockStart;
}
function availabilityBlockTitle(block) {
  return `${block.label || prettyStatus(block.block_type)} - ${formatDateOnly(block.start_date)} ${block.start_time || ''} to ${formatDateOnly(block.end_date)} ${block.end_time || ''}`.trim();
}
function calendarBlockLabel(rental, dayIso) {
  if (dayIso === rental.pickup_date && dayIso === rental.return_date) {
    return `${rental.pickup_time || '9:00 AM'}–${rental.return_time || '9:00 AM'}`;
  }
  if (dayIso === rental.pickup_date) return `From ${rental.pickup_time || '9:00 AM'}`;
  if (dayIso === rental.return_date) return `Due ${rental.return_time || '9:00 AM'}`;
  return 'Booked';
}
function calendarManualBlockLabel(block, dayIso) {
  const blockType = String(block?.block_type || '').toLowerCase();
  const fallbackLabel = block?.label || prettyStatus(blockType || 'unavailable');
  if (!block) return fallbackLabel;
  if (dayIso === block.start_date && dayIso !== block.end_date) return `From ${block.start_time || '12:00 AM'}`;
  if (dayIso !== block.end_date) return fallbackLabel;
  const endTime = block.end_time || '11:59 PM';
  if (dayIso === block.start_date) return `${block.start_time || '12:00 AM'}–${endTime}`;
  return ['reserved', 'on_road'].includes(blockType) ? `Due ${endTime}` : `Until ${endTime}`;
}
function buildCalendarDaySegments({ rentals = [], blocks = [], dayIso, vehicleId, availabilityTypes = DEFAULT_AVAILABILITY_TYPES }) {
  const dayStart = parseRentMeCtDateTime(dayIso, '12:00 AM');
  if (!dayStart) return [];
  const nextDayStart = new Date(dayStart);
  nextDayStart.setDate(nextDayStart.getDate() + 1);
  const dayDuration = nextDayStart.getTime() - dayStart.getTime();
  const toSegmentPosition = (start, end) => {
    const visibleStart = Math.max(start.getTime(), dayStart.getTime());
    const visibleEnd = Math.min(end.getTime(), nextDayStart.getTime());
    return {
      left: ((visibleStart - dayStart.getTime()) / dayDuration) * 100,
      width: ((visibleEnd - visibleStart) / dayDuration) * 100,
    };
  };

  const rentalSegments = rentals.flatMap((rental) => {
    const start = parseRentMeCtDateTime(rental.pickup_date, rental.pickup_time);
    const bookedEnd = parseRentMeCtDateTime(rental.return_date, rental.return_time);
    const blockedUntil = getRentalBlockedUntil(rental);
    const standardAvailableAt = bookedEnd ? new Date(bookedEnd.getTime() + TURNAROUND_BUFFER_MINUTES * 60 * 1000) : null;
    if (!start || !bookedEnd || !blockedUntil) return [];
    const type = rentalStatusToAvailabilityType(rental.status);
    const color = availabilityTypes[type]?.color || DEFAULT_AVAILABILITY_TYPES[type]?.color;
    const title = `${rental.profiles?.full_name || 'Client'} - ${prettyStatus(rental.status)}. Booked ${formatRentalDate(rental.pickup_date, rental.pickup_time)} to ${formatRentalDate(rental.return_date, rental.return_time)}. Next pickup after ${formatDateTime(blockedUntil)}.`;
    const segments = [];
    if (start < nextDayStart && bookedEnd > dayStart) {
      segments.push({
        id: `rental-${rental.id}`,
        kind: 'rental',
        item: rental,
        ...toSegmentPosition(start, bookedEnd),
        color,
        label: calendarBlockLabel(rental, dayIso),
        title,
      });
    }
    if (blockedUntil > bookedEnd && bookedEnd < nextDayStart && blockedUntil > dayStart) {
      segments.push({
        id: `rental-grace-${rental.id}`,
        kind: 'grace',
        sourceKind: 'rental',
        item: rental,
        dueAt: bookedEnd,
        standardAvailableAt,
        ...toSegmentPosition(bookedEnd, blockedUntil),
        color: '#f4c95d',
        label: '',
        title: `Three-hour turnaround after the ${formatTimeOnly(bookedEnd)} return. Available at ${formatTimeOnly(blockedUntil)}.`,
      });
    }
    return segments;
  });

  const blockSegments = blocks.flatMap((block) => {
    if (String(block.block_type || '').toLowerCase() === 'available') return [];
    const start = parseRentMeCtDateTime(block.start_date, block.start_time || '12:00 AM');
    const bookedEnd = parseRentMeCtDateTime(block.end_date, block.end_time || '11:59 PM');
    const blockedUntil = getAvailabilityBlockBlockedUntil(block);
    const standardAvailableAt = bookedEnd ? new Date(bookedEnd.getTime() + TURNAROUND_BUFFER_MINUTES * 60 * 1000) : null;
    if (!start || !bookedEnd || !blockedUntil) return [];
    const segments = [];
    if (start < nextDayStart && bookedEnd > dayStart) {
      segments.push({
        id: `block-${block.id}`,
        kind: 'manual-block',
        item: block,
        ...toSegmentPosition(start, bookedEnd),
        color: availabilityTypes[block.block_type]?.color || DEFAULT_AVAILABILITY_TYPES[block.block_type]?.color || '#394852',
        label: calendarManualBlockLabel(block, dayIso),
        title: availabilityBlockTitle(block),
      });
    }
    if (blockedUntil > bookedEnd && bookedEnd < nextDayStart && blockedUntil > dayStart) {
      segments.push({
        id: `block-grace-${block.id}`,
        kind: 'grace',
        sourceKind: 'manual-block',
        item: block,
        dueAt: bookedEnd,
        standardAvailableAt,
        ...toSegmentPosition(bookedEnd, blockedUntil),
        color: '#f4c95d',
        label: '',
        title: `Three-hour turnaround after the ${formatTimeOnly(bookedEnd)} end time. Available at ${formatTimeOnly(blockedUntil)}.`,
      });
    }
    return segments;
  });

  const occupied = [...rentalSegments, ...blockSegments].sort((a, b) => a.left - b.left || b.width - a.width);
  if (!occupied.length) return [];

  const gaps = [];
  let cursor = 0;
  occupied.forEach((segment, index) => {
    if (segment.left > cursor + 0.05) {
      gaps.push(buildAvailableCalendarSegment({ dayIso, vehicleId, left: cursor, width: segment.left - cursor, index }));
    }
    cursor = Math.max(cursor, segment.left + segment.width);
  });
  if (cursor < 99.95) {
    gaps.push(buildAvailableCalendarSegment({ dayIso, vehicleId, left: cursor, width: 100 - cursor, index: occupied.length }));
  }
  return [...occupied, ...gaps].sort((a, b) => a.left - b.left || (a.kind === 'available' ? 1 : -1));
}
function buildAvailableCalendarSegment({ dayIso, vehicleId, left, width, index }) {
  const startTime = calendarPercentToTime(dayIso, left);
  const endTime = calendarPercentToTime(dayIso, left + width, true);
  const endsDay = left + width >= 99.95;
  const startsDay = left <= 0.05;
  const label = startsDay
    ? `Available until ${endTime}`
    : endsDay
      ? `Available at ${startTime}`
      : `Available ${startTime}–${endTime}`;
  return {
    id: `available-${vehicleId}-${dayIso}-${index}`,
    kind: 'available',
    vehicleId,
    left,
    width,
    startTime,
    endTime,
    color: '#eef8f1',
    label,
    title: `${label}. Select a calendar color, then click here to apply it to this time window.`,
  };
}
function calendarPercentToTime(dayIso, percent, useEndOfDay = false) {
  if (useEndOfDay && percent >= 99.95) return '11:59 PM';
  const dayStart = parseRentMeCtDateTime(dayIso, '12:00 AM');
  const nextDayStart = new Date(dayStart);
  nextDayStart.setDate(nextDayStart.getDate() + 1);
  const date = new Date(dayStart.getTime() + ((nextDayStart.getTime() - dayStart.getTime()) * percent / 100));
  return formatTimeOnly(date);
}
function calendarCellClass({ unavailable, vehicleBlocked, rental, manualBlock, dayIso }) {
  if (!unavailable) return 'calendar-cell open';
  if (vehicleBlocked) return 'calendar-cell maintenance';
  if (manualBlock) return `calendar-cell manual-block ${String(manualBlock.block_type || 'unavailable').toLowerCase()}`;
  if (rental && dayIso === rental.return_date) return `calendar-cell booked return-day ${rentalStatusToAvailabilityType(rental.status)}`;
  return `calendar-cell booked ${rentalStatusToAvailabilityType(rental?.status)}`;
}
function getReturnDayBlockedPercent(rental, dayIso) {
  if (!rental || dayIso !== rental.return_date) return null;
  const dayStart = parseRentMeCtDateTime(dayIso, '12:00 AM');
  if (!dayStart) return null;
  const nextDayStart = new Date(dayStart);
  nextDayStart.setDate(nextDayStart.getDate() + 1);
  const blockedUntil = getRentalBlockedUntil(rental);
  if (!blockedUntil) return null;
  const percent = ((blockedUntil.getTime() - dayStart.getTime()) / (nextDayStart.getTime() - dayStart.getTime())) * 100;
  return Math.min(100, Math.max(0, percent));
}
function rentalStatusToAvailabilityType(status) {
  const normalized = String(status || '').toLowerCase();
  if (['active', 'overdue', 'return_initiated'].includes(normalized)) return 'on_road';
  return 'reserved';
}
function formatTimeOnly(date) {
  if (!date) return 'Blocked';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function formatDateTime(date) {
  if (!date) return 'blocked';
  return `${date.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })} ${formatTimeOnly(date)}`;
}
function calendarDays(count) {
  return calendarDaysFrom(adminBookingDateOffset(0), count);
}
function calendarDaysFrom(startDate, count) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${startDate}T12:00:00`);
    date.setDate(date.getDate() + index);
    const iso = date.toISOString().split('T')[0];
    return {
      iso,
      label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      shortLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
    };
  });
}
function buildOperationsQueue({ rentals, documents, messages, reports, extensionRequests = [] }) {
  const items = [];
  const paidRentalIds = new Set(rentals.map((rental) => rental.id));
  const documentsByRentalId = documents.reduce((grouped, document) => {
    const rentalId = document.rental_id || document.rentals?.id;
    if (!rentalId || !paidRentalIds.has(rentalId)) return grouped;
    if (!grouped[rentalId]) grouped[rentalId] = [];
    grouped[rentalId].push(document);
    return grouped;
  }, {});

  rentals.forEach((rental) => {
    const customer = rental.profiles?.full_name || rental.user_email || 'Client';
    const vehicle = rental.vehicles?.name || 'Vehicle';
    const rentalDocuments = documentsByRentalId[rental.id] || [];
    const paymentPaid = (rental.payment_status || 'pending') === 'paid';
    const terminal = ['completed', 'cancelled'].includes(rental.status);
    const latestLicense = documents
      .filter((document) => document.user_id === rental.user_id && document.document_type === 'license')
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
    const latestInsurance = rentalDocuments
      .filter((document) => document.document_type === 'insurance')
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
    const hasLicense = Boolean(latestLicense && latestLicense.status !== 'rejected');
    const hasInsurance = Boolean(latestInsurance && latestInsurance.status !== 'rejected');
    const releaseDocsApproved = latestLicense?.status === 'approved' && latestInsurance?.status === 'approved';
    const identityVerified = rental.profiles?.identity_verification_status === 'verified';

    if (!terminal) {
      const returnState = getLateReturnState(rental.return_date, rental.return_time, rental.status);
      if (returnState.overdue) {
        const nextRental = rentals
          .filter((candidate) =>
            candidate.id !== rental.id &&
            candidate.vehicle_id === rental.vehicle_id &&
            !['completed', 'cancelled'].includes(candidate.status) &&
            returnState.due &&
            parseRentMeCtDateTime(candidate.pickup_date, candidate.pickup_time) > returnState.due
          )
          .sort((a, b) =>
            parseRentMeCtDateTime(a.pickup_date, a.pickup_time) -
            parseRentMeCtDateTime(b.pickup_date, b.pickup_time)
          )[0];
        const nextRisk = nextRental
          ? ` NEXT BOOKING AT RISK: ${formatRentalDate(nextRental.pickup_date, nextRental.pickup_time)}.`
          : '';
        const graceEnd = returnState.graceEnds?.toLocaleString() || 'at the scheduled three-hour deadline';
        items.push({ id: `overdue-${rental.id}`, bucket: 'return_attention', severity: 'critical', title: 'Late return — inventory hard-locked', subtitle: `${customer} • ${vehicle}`, detail: `Grace ended ${graceEnd}. Physical return and inspection are required before this car can be booked.${nextRisk}`, rental });
      } else if (returnState.inGrace) {
        items.push({ id: `grace-${rental.id}`, bucket: 'return_attention', severity: 'warning', title: 'Three-hour return grace active', subtitle: `${customer} • ${vehicle}`, detail: `Due ${formatRentalDate(rental.return_date, rental.return_time)}. Hard inventory lock begins ${returnState.graceEnds.toLocaleString()} unless the return is completed.`, rental });
      } else if (isDueSoon(rental.return_date, rental.return_time)) {
        items.push({ id: `due-${rental.id}`, bucket: 'return_attention', severity: 'warning', title: 'Return due soon', subtitle: `${customer} • ${vehicle}`, detail: `Due ${formatRentalDate(rental.return_date, rental.return_time)}`, rental });
      }
    }
    if (!terminal && rental.agreement_signed && paymentPaid && (!hasLicense || !hasInsurance)) {
      const missing = [
        !hasLicense ? 'driver license' : '',
        !hasInsurance ? 'insurance' : '',
      ].filter(Boolean).join(' and ');
      items.push({
        id: `pickup-docs-${rental.id}`,
        severity: 'warning',
        title: 'Paid rental missing pickup documents',
        subtitle: `${customer} • ${vehicle}`,
        detail: `Missing ${missing}. Customer cannot be released for pickup yet.`,
        rental,
        bucket: 'needs_approval',
      });
    }
    if (!rental.agreement_signed && ['documents_needed', 'document_review', 'approved'].includes(rental.status)) {
      items.push({ id: `unsigned-${rental.id}`, bucket: 'payment_needed', severity: 'warning', title: 'Agreement unsigned', subtitle: `${customer} • ${vehicle}`, detail: 'Customer has not completed agreement signature.', rental });
    }
    if (!terminal && !identityVerified && paymentPaid) {
      items.push({
        id: `identity-${rental.id}`,
        bucket: 'needs_approval',
        severity: 'warning',
        title: 'Stripe Identity required',
        subtitle: `${customer} • ${vehicle}`,
        detail: `Status: ${prettyStatus(rental.profiles?.identity_verification_status || 'unverified')}. Vehicle pickup remains blocked.`,
        rental,
      });
    }
    if ((rental.payment_status || 'pending') !== 'paid' && ['pending', 'documents_needed', 'document_review', 'approved'].includes(rental.status)) {
      items.push({ id: `payment-${rental.id}`, bucket: 'payment_needed', severity: 'warning', title: 'Payment pending', subtitle: `${customer} • ${vehicle}`, detail: `Payment status: ${prettyStatus(rental.payment_status || 'pending')}`, rental, localPaymentAction: true });
    }
    const phoneVerified = Boolean(rental.profiles?.phone_verified || rental.profiles?.phone_verified_at);
    if (['document_review', 'approved', 'ready_for_pickup'].includes(rental.status) && phoneVerified && identityVerified && rental.agreement_signed && paymentPaid && releaseDocsApproved) {
      items.push({ id: `pickup-${rental.id}`, bucket: 'pickup_today', severity: 'info', title: 'Release ready', subtitle: `${customer} • ${vehicle}`, detail: `Approved documents. Open the rental row to record pickup mileage and release ${formatRentalDate(rental.pickup_date, rental.pickup_time)}.`, rental });
    }
    if (rental.status === 'return_initiated') {
      items.push({ id: `return-${rental.id}`, bucket: 'return_attention', severity: 'critical', title: 'Return initiated', subtitle: `${customer} • ${vehicle}`, detail: 'Customer confirmed return. Open the rental row to inspect the vehicle and enter ending mileage.', rental });
    }
  });
  documents.filter((d) => paidRentalIds.has(d.rental_id || d.rentals?.id) && (d.status === 'pending_review' || d.status === 'rejected')).forEach((document) => {
    items.push({ id: `doc-${document.id}`, bucket: 'needs_approval', severity: document.status === 'rejected' ? 'warning' : 'info', title: document.status === 'rejected' ? 'Document rejected' : 'Document pending review', subtitle: `${document.profiles?.full_name || document.user_id} • ${docLabel(document.document_type)}`, detail: new Date(document.created_at).toLocaleString(), document });
  });
  extensionRequests.filter((request) => ['pending', 'approved_pending_payment'].includes(request.status)).forEach((extension) => {
    const rental = extension.rentals;
    const customer = rental?.profiles?.full_name || extension.user_id || 'Client';
    const vehicle = rental?.vehicles?.name || 'Vehicle';
    const waitingOnPayment = extension.status === 'approved_pending_payment';
    const extensionInsurance = documents
      .filter((document) =>
        document.rental_id === extension.rental_id &&
        document.document_type === 'insurance' &&
        document.extension_request_id === extension.id
      )
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
    const insuranceDetail = extensionInsurance?.status === 'approved'
      ? 'New insurance approved.'
      : extensionInsurance
        ? `New insurance ${prettyStatus(extensionInsurance.status)}.`
        : 'Waiting for new extension insurance.';
    items.push({
      id: `extension-${extension.id}`,
      bucket: waitingOnPayment ? 'payment_needed' : 'needs_approval',
      severity: waitingOnPayment ? 'warning' : 'info',
      title: waitingOnPayment ? 'Extension payment required' : 'Extension needs decision',
      subtitle: `${customer} • ${vehicle}`,
      detail: waitingOnPayment
        ? `${money(extension.extension_total_amount)} due before ${formatRentalDate(extension.requested_return_date, extension.requested_return_time)} activates. ${insuranceDetail}`
        : `Requested return ${formatRentalDate(extension.requested_return_date, extension.requested_return_time)}. ${insuranceDetail}`,
      extension,
      extensionInsurance,
      rental,
    });
  });
  messages.filter((m) => paidRentalIds.has(m.rental_id || m.rentals?.id) && m.sender_role === 'client' && !m.read_by_admin).forEach((message) => {
    const isReturnConfirmation = String(message.message || '').includes('RETURN CONFIRMATION');
    const rental = rentals.find((item) => item.id === message.rental_id);
    items.push({
      id: `msg-${message.id}`,
      bucket: isReturnConfirmation ? 'return_attention' : 'needs_approval',
      severity: isReturnConfirmation ? 'critical' : 'info',
      title: isReturnConfirmation ? 'Customer confirmed return' : 'Unread client message',
      subtitle: message.profiles?.full_name || rental?.profiles?.full_name || message.user_id,
      detail: message.message,
      rental,
      nextStatus: null,
    });
  });
  reports.filter((r) => paidRentalIds.has(r.rental_id || r.rentals?.id) && ['open', 'pending', 'new'].includes(String(r.status || 'open').toLowerCase())).forEach((report) => {
    items.push({ id: `report-${report.id}`, bucket: 'return_attention', severity: 'critical', title: 'Open damage/incident report', subtitle: report.profiles?.full_name || report.user_id, detail: report.description || report.status || 'Open report' });
  });
  const rank = { critical: 0, warning: 1, info: 2 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function buildAdminAgreementSnapshot(rental, signatureName, signatureImage) {
  const profile = rental.profiles || {};
  const vehicle = rental.vehicles || {};
  const details = `
AUTO-FILLED RENTAL DETAILS

Agreement Version: ${AGREEMENT_VERSION}
Signed Snapshot Generated: ${new Date().toISOString()}

Renter Name: ${profile.full_name || rental.customer_name_snapshot || 'Pending'}
Address: ${profile.address || 'Pending'}
Intended Vehicle Use: ${profile.intended_vehicle_use || 'Pending'}
Phone: ${profile.phone || rental.customer_phone_snapshot || 'Pending'}
Email: ${profile.email || rental.customer_email_snapshot || 'Pending'}

Vehicle: ${vehicle.name || 'Pending'}
Make: ${vehicle.brand || vehicle.make || 'Pending'}
Model: ${vehicle.model || 'Pending'}
Year: ${vehicle.year || 'Pending'}
VIN: ${vehicle.vin || 'Pending'}
License Plate: ${vehicle.plate_number || vehicle.license_plate || 'Pending'}

Pickup Date/Time: ${formatRentalDate(rental.pickup_date, rental.pickup_time)}
Return Date/Time: ${formatRentalDate(rental.return_date, rental.return_time)}
Return Location: ${RENTMECT_ADDRESS}

Daily Rate: ${vehicle.daily_rate ? money(vehicle.daily_rate) : 'Pending'}
Base Rental Total: ${rental.base_rental_total ? money(rental.base_rental_total) : rental.rental_total ? money(rental.rental_total) : 'Pending'}
Under-25 Rental Markup: ${Number(rental.under_25_markup_amount || 0) > 0 ? `${money(rental.under_25_markup_amount)} (${Number(rental.under_25_markup_percentage || 0)}%)` : 'Not applied'}
Rental Total: ${rental.rental_total ? money(rental.rental_total) : 'Pending'}
Tax Amount: ${rental.tax_amount ? money(rental.tax_amount) : 'Pending'}
Security Deposit: ${rental.security_deposit ? money(rental.security_deposit) : vehicle.security_deposit ? money(vehicle.security_deposit) : 'Pending'}
Mileage Policy: ${MILEAGE_POLICY}
Cancellation Terms: ${CANCELLATION_TERMS}
Typed Signature: ${signatureName || rental.agreement_signature_name || 'Pending'}
Drawn Signature Image: ${signatureImage || extractSignatureImage(rental.agreement_snapshot) || 'Pending'}

------------------------------------------------------------
`;

  return `${details}\n${AGREEMENT_TEXT}`;
}

function getRentalProgressSteps(rental, rentalDocuments = [], emergencyScopeSet = new Set(), completionScopeSet = new Set()) {
  const license = latestDocument(rentalDocuments, 'license');
  const insurance = latestDocument(rentalDocuments, 'insurance');
  const hasLicense = license?.status === 'approved';
  const hasInsurance = insurance?.status === 'approved';
  const phoneVerified = Boolean(rental.profiles?.phone_verified || rental.profiles?.phone_verified_at || completionScopeSet.has('phone'));
  const identityVerified = rental.profiles?.identity_verification_status === 'verified' || completionScopeSet.has('identity');
  const hasDatesAndVehicle = Boolean(rental.vehicle_id && rental.pickup_date && rental.return_date);
  const agreementSigned = Boolean(rental.agreement_signed || completionScopeSet.has('agreement'));
  const paymentPaid = (rental.payment_status || 'pending') === 'paid' || completionScopeSet.has('payment');
  const depositComplete = Number(rental.security_deposit || 0) === 0 || ['held', 'waived', 'released', 'transferred', 'release_pending', 'adjustment_refund_due'].includes(String(rental.deposit_status || '').toLowerCase()) || completionScopeSet.has('deposit');
  const effectiveLicenseNative = hasLicense || completionScopeSet.has('license');
  const effectiveInsuranceNative = hasInsurance || completionScopeSet.has('insurance');
  const effectivePhone = phoneVerified || emergencyScopeSet.has('phone');
  const effectiveIdentity = identityVerified || emergencyScopeSet.has('identity');
  const effectiveLicense = effectiveLicenseNative || emergencyScopeSet.has('license');
  const effectiveInsurance = effectiveInsuranceNative || emergencyScopeSet.has('insurance');
  const effectiveAgreement = agreementSigned || emergencyScopeSet.has('agreement');
  const effectivePayment = paymentPaid || emergencyScopeSet.has('payment');
  const readyForPickup = rental.status === 'ready_for_pickup' || (
    effectivePhone &&
    effectiveIdentity &&
    hasDatesAndVehicle &&
    effectiveAgreement &&
    effectivePayment &&
    effectiveLicense &&
    effectiveInsurance &&
    depositComplete
  );

  const steps = [
    { key: 'phone', label: 'Phone', complete: phoneVerified, detail: phoneVerified ? 'Phone verified' : 'Phone verification needed' },
    { key: 'identity', label: 'Identity', complete: identityVerified, detail: completionScopeSet.has('identity') || rental.profiles?.identity_verification_method === 'admin_in_person' ? 'Verified in person by admin' : identityVerified ? 'Stripe Identity verified' : `Stripe Identity ${prettyStatus(rental.profiles?.identity_verification_status || 'unverified')}` },
    { key: 'vehicle', label: 'Vehicle', complete: hasDatesAndVehicle, detail: hasDatesAndVehicle ? 'Dates and vehicle selected' : 'Dates or vehicle missing' },
    { key: 'license', label: 'License', complete: effectiveLicenseNative, detail: completionScopeSet.has('license') ? 'Verified in person by admin' : hasLicense ? `Driver license ${prettyStatus(license.status)}` : license?.status === 'rejected' ? 'Driver license rejected — replacement required' : 'Driver license missing' },
    { key: 'insurance', label: 'Insurance', complete: effectiveInsuranceNative, detail: completionScopeSet.has('insurance') ? 'Verified in person by admin' : hasInsurance ? `Insurance ${prettyStatus(insurance.status)}` : insurance?.status === 'rejected' ? 'Insurance rejected — replacement required' : 'Insurance missing' },
    { key: 'agreement', label: 'Agreement', complete: agreementSigned, detail: agreementSigned ? 'Agreement signed' : 'Agreement not signed' },
    { key: 'payment', label: 'Payment', complete: paymentPaid, detail: paymentPaid ? 'Payment complete' : `Payment ${prettyStatus(rental.payment_status || 'pending')}` },
    { key: 'deposit', label: 'Deposit', complete: depositComplete, detail: depositComplete ? `Deposit ${prettyStatus(rental.deposit_status || 'complete')}` : 'Deposit collection required' },
    { key: 'ready', label: 'Ready', complete: readyForPickup, detail: readyForPickup ? 'Ready for pickup' : 'Not ready for pickup' },
  ];

  const eligibleForBypass = ['pending', 'documents_needed', 'document_review', 'approved', 'ready_for_pickup'].includes(String(rental.status || '').toLowerCase());
  const firstMissingIndex = steps.findIndex((step) => !step.complete && !emergencyScopeSet.has(step.key));
  return steps.map((step, index) => ({
    ...step,
    adminAction: !['vehicle', 'ready'].includes(step.key) && !['active', 'overdue', 'return_initiated', 'completed', 'cancelled'].includes(String(rental.status || '').toLowerCase()),
    bypassed: emergencyScopeSet.has(step.key),
    bypassable: eligibleForBypass && !step.complete && !emergencyScopeSet.has(step.key) && Object.hasOwn(EMERGENCY_SCOPE_LABELS, step.key),
    state: step.complete ? 'complete' : emergencyScopeSet.has(step.key) ? 'bypassed' : index === firstMissingIndex ? 'current' : 'missing',
  }));
}

function getActiveEmergencyScopeSet(exception) {
  if (!exception || exception.status !== 'active' || new Date(exception.expires_at).getTime() <= Date.now()) return new Set();
  const resolved = new Set(exception.resolved_scopes || []);
  return new Set((exception.exception_scopes || []).filter((scope) => !resolved.has(scope)));
}

function getEffectiveReleaseChecklist(checklist, emergencyScopeSet = new Set()) {
  const effective = {
    ...checklist,
    phone: checklist.phone || emergencyScopeSet.has('phone'),
    identity: checklist.identity || emergencyScopeSet.has('identity'),
    license: checklist.license || emergencyScopeSet.has('license'),
    insurance: checklist.insurance || emergencyScopeSet.has('insurance'),
    agreement: checklist.agreement || emergencyScopeSet.has('agreement'),
    payment: checklist.payment || emergencyScopeSet.has('payment'),
    deposit: checklist.deposit || emergencyScopeSet.has('deposit'),
  };
  effective.ready = Boolean(
    effective.phone && effective.identity && effective.vehicle && effective.license &&
    effective.insurance && effective.agreement && effective.payment && effective.deposit
  );
  return effective;
}

function getReleaseChecklist(rental, rentalDocuments = []) {
  const license = latestDocument(rentalDocuments, 'license');
  const insurance = latestDocument(rentalDocuments, 'insurance');
  return {
    phone: Boolean(rental.profiles?.phone_verified || rental.profiles?.phone_verified_at),
    identity: rental.profiles?.identity_verification_status === 'verified',
    vehicle: Boolean(rental.vehicle_id && rental.pickup_date && rental.return_date),
    agreement: Boolean(rental.agreement_signed),
    payment: (rental.payment_status || 'pending') === 'paid',
    deposit: Number(rental.security_deposit || 0) === 0 || ['held', 'waived', 'released', 'transferred', 'release_pending', 'adjustment_refund_due'].includes(String(rental.deposit_status || '').toLowerCase()),
    license: license?.status === 'approved',
    insurance: insurance?.status === 'approved',
    ready: Boolean(
      (rental.profiles?.phone_verified || rental.profiles?.phone_verified_at) &&
      rental.profiles?.identity_verification_status === 'verified' &&
      rental.vehicle_id &&
      rental.pickup_date &&
      rental.return_date &&
      rental.agreement_signed &&
      (rental.payment_status || 'pending') === 'paid' &&
      (Number(rental.security_deposit || 0) === 0 || ['held', 'waived', 'released', 'transferred', 'release_pending', 'adjustment_refund_due'].includes(String(rental.deposit_status || '').toLowerCase())) &&
      license?.status === 'approved' &&
      insurance?.status === 'approved'
    ),
  };
}

function getMissingReleaseRequirements(releaseChecklist) {
  return [
    !releaseChecklist.phone ? 'phone verification' : '',
    !releaseChecklist.identity ? 'Stripe Identity verification' : '',
    !releaseChecklist.agreement ? 'signed agreement' : '',
    !releaseChecklist.payment ? 'payment' : '',
    !releaseChecklist.deposit ? 'deposit' : '',
    !releaseChecklist.license ? 'driver license' : '',
    !releaseChecklist.insurance ? 'insurance' : '',
  ].filter(Boolean);
}

function getAdminRentalState(rental, releaseChecklist) {
  if (rental.status === 'completed') return { label: 'Completed', tone: 'success', next: 'This rental is closed.' };
  if (rental.status === 'cancelled') return { label: 'Cancelled', tone: 'danger', next: 'This rental is cancelled.' };
  if (rental.status === 'return_initiated') return { label: 'Return Pending', tone: 'danger', next: 'Inspect the car, then confirm return complete.' };
  if (rental.status === 'overdue') return { label: 'Overdue', tone: 'danger', next: 'Contact customer or wait for return confirmation.' };
  if (rental.status === 'active') return { label: 'Car Out', tone: 'info', next: 'Customer has the vehicle. Watch return and extension requests.' };
  if (releaseChecklist.ready) return { label: 'Ready For Pickup', tone: 'success', next: 'Mark vehicle picked up when the customer gets the keys.' };
  if (!releaseChecklist.phone) return { label: 'Phone Needed', tone: 'warning', next: 'Customer needs phone verification.' };
  if (!releaseChecklist.identity) return { label: 'Identity Needed', tone: 'warning', next: 'Customer must complete Stripe Identity before pickup.' };
  if (!releaseChecklist.license || !releaseChecklist.insurance) return { label: 'Documents Needed', tone: 'warning', next: 'Upload and approve license and insurance before pickup.' };
  if (!releaseChecklist.agreement) return { label: 'Agreement Needed', tone: 'warning', next: 'Customer needs to sign the rental agreement.' };
  if (!releaseChecklist.payment) return { label: 'Payment Needed', tone: 'warning', next: 'Open Stripe Checkout or record an eligible local payment.' };
  return { label: prettyStatus(rental.status || 'Pending'), tone: 'info', next: 'Review the checklist for the next missing step.' };
}

function rentalDisplayName(rental) {
  const vehicle = rental?.vehicles?.name || 'Rental';
  const customer = rental?.profiles?.full_name || rental?.customer_name_snapshot || '';
  return customer ? `${vehicle} for ${customer}` : vehicle;
}

function rentalTransitionNotice(rental, status) {
  const destination = status === 'active'
    ? 'Cars Out'
    : status === 'ready_for_pickup'
      ? 'Ready For Pickup'
      : ['completed', 'cancelled'].includes(status)
        ? `Archive (${prettyStatus(status)})`
        : 'Needs Action';
  return `${rentalDisplayName(rental)} moved to ${destination} in Rental Manager.`;
}

function rentalFilterOptions() {
  return [
    { key: 'needs_action', label: 'Needs Action' },
    { key: 'ready_pickup', label: 'Ready For Pickup' },
    { key: 'cars_out', label: 'Cars Out' },
    { key: 'returns_today', label: 'Returns Today' },
    { key: 'extensions', label: 'Extensions Pending' },
    { key: 'maintenance', label: 'Maintenance' },
    { key: 'all', label: 'All Open' },
    { key: 'archive', label: 'Archive' },
  ];
}

function rentalMatchesFilter(rental, filter, { documents = [], extensionRequests = [], vehicles = [] } = {}) {
  if (filter === 'archive') return ['completed', 'cancelled'].includes(String(rental.status || '').toLowerCase());
  if (filter === 'all') return !['completed', 'cancelled'].includes(String(rental.status || '').toLowerCase());
  const rentalDocuments = documents.filter((document) => document.rental_id === rental.id);
  const reusableLicense = latestCustomerDocument(documents, rental.user_id, 'license');
  const documentsForProgress = reusableLicense && !rentalDocuments.some((document) => document.id === reusableLicense.id)
    ? [reusableLicense, ...rentalDocuments]
    : rentalDocuments;
  const releaseChecklist = getReleaseChecklist(rental, documentsForProgress);
  const hasOpenExtension = extensionRequests.some((request) =>
    (request.rental_id === rental.id || request.rentals?.id === rental.id) &&
    ['pending', 'approved_pending_payment'].includes(request.status)
  );
  const vehicle = vehicles.find((item) => item.id === rental.vehicle_id) || rental.vehicles;
  const vehicleStatus = String(vehicle?.status || '').toLowerCase();

  if (filter === 'ready_pickup') return releaseChecklist.ready && !['active', 'overdue', 'return_initiated', 'completed', 'cancelled'].includes(rental.status);
  if (filter === 'cars_out') return ['active', 'overdue', 'return_initiated'].includes(rental.status);
  if (filter === 'returns_today') return ['active', 'overdue', 'return_initiated'].includes(rental.status) && isToday(rental.return_date);
  if (filter === 'extensions') return hasOpenExtension;
  if (filter === 'maintenance') return ['maintenance', 'unavailable', 'inactive'].includes(vehicleStatus);
  return (
    hasOpenExtension ||
    rental.status === 'return_initiated' ||
    isOverdue(rental.return_date, rental.return_time, rental.status) ||
    (rental.payment_status || 'pending') !== 'paid' ||
    !releaseChecklist.ready
  ) && !['completed', 'cancelled'].includes(rental.status);
}

function latestCustomerDocument(documents = [], userId, type) {
  return documents
    .filter((document) => document.user_id === userId && document.document_type === type)
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))[0];
}

function latestDocument(documents = [], type) {
  return documents
    .filter((document) => document.document_type === type)
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))[0];
}

function vehicleStatusForRentalStatus(status) {
  if (['pending', 'documents_needed', 'document_review', 'approved', 'ready_for_pickup'].includes(status)) return 'reserved';
  if (['active', 'overdue', 'return_initiated'].includes(status)) return 'rented';
  if (['completed', 'cancelled'].includes(status)) return 'available';
  return null;
}
function parseMileageInput(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const mileage = Number(String(value).replaceAll(',', '').trim());
  return Number.isInteger(mileage) && mileage >= 0 ? mileage : null;
}
function parseOptionalPositiveInteger(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(String(value).replaceAll(',', '').trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
function calculateMilesDriven(startingMileage, endingMileage) {
  const start = parseMileageInput(startingMileage);
  const end = parseMileageInput(endingMileage);
  if (start === null || end === null || end < start) return null;
  return end - start;
}
function formatMiles(value) {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  return `${Number(value || 0).toLocaleString('en-US')} mi`;
}
function customerInitials(value) {
  const parts = String(value || 'Customer').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'C';
}
function getVehicleMaintenanceState(vehicle) {
  const current = parseMileageInput(vehicle?.current_mileage);
  const interval = Number(vehicle?.maintenance_interval_miles || DEFAULT_MAINTENANCE_INTERVAL);
  const baseline = parseMileageInput(vehicle?.last_maintenance_mileage)
    ?? parseMileageInput(vehicle?.original_mileage);
  const storedNext = parseMileageInput(vehicle?.next_maintenance_mileage);
  const next = storedNext ?? (baseline === null ? null : baseline + interval);

  if (current === null || next === null) {
    return { due: false, soon: false, remaining: null, next, label: 'Add mileage and service interval' };
  }

  const remaining = next - current;
  if (remaining <= 0) {
    return { due: true, soon: true, remaining, next, label: `Maintenance due now (${Math.abs(remaining).toLocaleString('en-US')} mi overdue)` };
  }
  if (remaining <= 500) {
    return { due: false, soon: true, remaining, next, label: `Maintenance due in ${remaining.toLocaleString('en-US')} mi` };
  }
  return { due: false, soon: false, remaining, next, label: `Next maintenance at ${formatMiles(next)}` };
}
function getMaintenanceScheduleState(schedule, vehicle) {
  if (!schedule || schedule.active === false) return { due: false, soon: false, label: 'Milestone paused' };
  const currentMileage = parseMileageInput(vehicle?.current_mileage);
  const nextMileage = parseMileageInput(schedule.next_due_mileage);
  const remainingMiles = currentMileage === null || nextMileage === null ? null : nextMileage - currentMileage;
  const today = new Date(`${adminBookingDateOffset(0)}T12:00:00`);
  const dueDate = schedule.next_due_at ? new Date(`${schedule.next_due_at}T12:00:00`) : null;
  const remainingDays = dueDate ? Math.ceil((dueDate.getTime() - today.getTime()) / 86400000) : null;
  const due = (remainingMiles !== null && remainingMiles <= 0) || (remainingDays !== null && remainingDays <= 0);
  const soon = due
    || (remainingMiles !== null && remainingMiles <= Number(schedule.warning_miles || 0))
    || (remainingDays !== null && remainingDays <= Number(schedule.warning_days || 0));
  if (due) {
    const reasons = [];
    if (remainingMiles !== null && remainingMiles <= 0) reasons.push(`${Math.abs(remainingMiles).toLocaleString('en-US')} mi overdue`);
    if (remainingDays !== null && remainingDays <= 0) reasons.push(remainingDays === 0 ? 'due today' : `${Math.abs(remainingDays)} days overdue`);
    return { due, soon, remainingMiles, remainingDays, label: `${schedule.label}: ${reasons.join(' • ')}` };
  }
  const targets = [];
  if (remainingMiles !== null) targets.push(`${remainingMiles.toLocaleString('en-US')} mi remaining`);
  if (remainingDays !== null) targets.push(`${remainingDays} days remaining`);
  return { due, soon, remainingMiles, remainingDays, label: `${schedule.label}: ${targets.join(' • ') || 'add service baseline'}` };
}
function maintenanceIntervalLabel(schedule) {
  const intervals = [];
  if (schedule?.interval_miles) intervals.push(`every ${Number(schedule.interval_miles).toLocaleString('en-US')} mi`);
  if (schedule?.interval_months) intervals.push(`every ${schedule.interval_months} months`);
  return intervals.join(' or ') || 'No interval configured';
}

function customerRiskProfile(profile, rentals, documents, reports) {
  const completed = rentals.filter((r) => r.status === 'completed').length;
  const late = rentals.filter((r) => r.status === 'overdue' || r.late_return_count > 0 || isOverdue(r.return_date, r.return_time, r.status)).length;
  const rejectedDocs = documents.filter((d) => d.status === 'rejected').length;
  const openReports = reports.filter((r) => ['open', 'pending', 'new'].includes(String(r.status || 'open').toLowerCase())).length;
  const chargebacks = rentals.reduce((sum, r) => sum + Number(r.chargeback_count || 0), 0);
  const depositsHeld = rentals.reduce((sum, r) => sum + Number(r.deposit_held_amount || 0), 0);
  const depositsReleased = rentals.reduce((sum, r) => sum + Number(r.deposit_released_amount || 0), 0);
  const blocked = profile.blocked_customer || rentals.some((r) => r.blocked_customer);
  const score = (blocked ? 6 : 0) + late * 2 + rejectedDocs + openReports * 2 + chargebacks * 3 + (depositsHeld > 0 ? 1 : 0);
  const level = score >= 6 ? 'high' : score >= 3 ? 'medium' : 'low';
  const summary = blocked ? 'Blocked customer flag is active.' : score === 0 ? 'Clean history based on available records.' : 'Review history before approving another rental.';
  return { level, summary, completed, late, rejectedDocs, openReports, depositsHeld, depositsReleased };
}
function buildPaymentEvents({
  rentals = [],
  rentalPayments = [],
  rentalRefunds = [],
  extensionRequests = [],
  rentalCharges = [],
  depositAllocations = [],
  stripeReconciliationIssues = [],
}) {
  const events = [];
  const rentalsById = new Map(rentals.map((rental) => [rental.id, rental]));
  const ledgerRentalIds = new Set(rentalPayments.map((payment) => payment.rental_id).filter(Boolean));
  const allocationHolderIds = new Set(depositAllocations.map((allocation) => allocation.holder_rental_id).filter(Boolean));
  const ledgerPaymentIntents = new Set(rentalPayments.map((payment) => payment.stripe_payment_intent_id).filter(Boolean));
  const ledgerCheckoutSessions = new Set(rentalPayments.map((payment) => payment.stripe_checkout_session_id).filter(Boolean));
  const contextFor = (source, rentalId) => {
    const rental = source?.rentals || rentalsById.get(rentalId);
    return {
      rental,
      customer: rental?.profiles?.full_name || rental?.customer_name_snapshot || rental?.user_email || rental?.customer_email_snapshot || source?.user_id || 'Client',
      vehicle: rental?.vehicles?.name || 'Vehicle',
    };
  };

  rentalPayments.forEach((payment) => {
    const { rental, customer, vehicle } = contextFor(payment, payment.rental_id);
    const statusGroup = normalizeLedgerStatus(payment.status);
    const paymentType = String(payment.payment_type || 'rental').toLowerCase();
    const type = paymentType.includes('extension') ? 'extension' : 'rental';
    const totalAmount = Number(payment.total_amount || 0);
    const depositAmount = Number(payment.deposit_amount || 0);
    const itemizedRentalAmount = Number(payment.rental_amount || 0) + Number(payment.tax_amount || 0);
    const rentalAmount = Math.max(0, totalAmount - depositAmount, itemizedRentalAmount);
    const sourceDetail = paymentSourceDetail(payment);

    if (rentalAmount > 0 || depositAmount <= 0) {
      const amount = rentalAmount || totalAmount;
      events.push({
        id: `ledger-${payment.id}`,
        rentalId: rental?.id || payment.rental_id,
        customer,
        vehicle,
        type,
        typeLabel: type === 'extension' ? 'Extension' : 'Rental',
        statusGroup,
        displayStatus: payment.status || 'pending',
        amount,
        cashImpact: ['paid', 'partially_paid'].includes(statusGroup) ? amount : 0,
        outstandingAmount: statusGroup === 'pending' ? amount : 0,
        detail: [
          rental ? `Rental ${formatRentalDate(rental.pickup_date, rental.pickup_time)} to ${formatRentalDate(rental.return_date, rental.return_time)}` : prettyStatus(payment.payment_type || 'Rental payment'),
          sourceDetail,
          payment.failure_reason,
        ].filter(Boolean).join(' • '),
        date: payment.paid_at || payment.updated_at || payment.created_at,
      });
    }

    if (depositAmount > 0 && !allocationHolderIds.has(payment.rental_id)) {
      const depositStatus = String(payment.deposit_status || payment.status || 'pending').toLowerCase();
      const depositCollected = ['paid', 'partially_paid'].includes(statusGroup)
        || ['held', 'release_pending', 'released'].includes(depositStatus);
      events.push({
        id: `ledger-deposit-${payment.id}`,
        rentalId: rental?.id || payment.rental_id,
        customer,
        vehicle,
        type: 'deposit',
        typeLabel: 'Security Deposit',
        statusGroup: depositCollected ? 'paid' : normalizeLedgerStatus(depositStatus),
        displayStatus: depositStatus,
        amount: depositAmount,
        cashImpact: depositCollected ? depositAmount : 0,
        outstandingAmount: depositCollected ? 0 : depositAmount,
        detail: [prettyStatus(payment.payment_type || 'Rental payment'), sourceDetail].filter(Boolean).join(' • '),
        date: payment.paid_at || payment.updated_at || payment.created_at,
      });
    }

    const refundedAmount = Number(payment.refunded_amount || 0);
    if (refundedAmount > 0 && !allocationHolderIds.has(payment.rental_id)) {
      events.push({
        id: `ledger-refund-${payment.id}`,
        rentalId: rental?.id || payment.rental_id,
        customer,
        vehicle,
        type: 'refund',
        typeLabel: 'Refund',
        statusGroup: 'refunded',
        displayStatus: payment.issue_status || 'refunded',
        amount: -refundedAmount,
        cashImpact: -refundedAmount,
        outstandingAmount: 0,
        detail: [payment.deposit_refunded_at ? 'Deposit refund' : 'Payment refund', sourceDetail].filter(Boolean).join(' • '),
        date: payment.deposit_refunded_at || payment.updated_at || payment.created_at,
      });
    }
  });

  rentalRefunds.forEach((refund) => {
    const { customer, vehicle } = contextFor(refund, refund.rental_id);
    const status = String(refund.status || 'pending').toLowerCase();
    const succeeded = status === 'succeeded';
    events.push({
      id: `rental-payment-refund-${refund.id}`,
      rentalId: refund.rental_id,
      customer,
      vehicle,
      type: 'refund',
      typeLabel: 'Rental Refund',
      statusGroup: succeeded ? 'refunded' : status === 'failed' || status === 'cancelled' ? 'failed' : 'pending',
      displayStatus: status,
      amount: -Number(refund.amount || 0),
      cashImpact: succeeded ? -Number(refund.amount || 0) : 0,
      outstandingAmount: 0,
      detail: [refund.reason, shortPaymentReference(refund.stripe_refund_id, 'Refund')].filter(Boolean).join(' • '),
      date: refund.updated_at || refund.created_at,
    });
  });

  rentals
    .filter((rental) => String(rental.status || '').toLowerCase() !== 'cancelled' && !ledgerRentalIds.has(rental.id))
    .forEach((rental) => {
      const { customer, vehicle } = contextFor(rental, rental.id);
      const statusGroup = normalizePaymentStatus(rental.payment_status);
      const totalDue = Number(rental.rental_total || 0)
        + Number(rental.service_fee_total || 0)
        + Number(rental.tax_amount || 0);
      const recordedPayment = Number(rental.payment_amount_cents || 0) / 100;
      const amount = statusGroup === 'partially_paid' && recordedPayment > 0 ? recordedPayment : totalDue;
      // Stripe's rental snapshot amount includes the security deposit. Keep the
      // rental portion capped at its own total because deposits are emitted as
      // separate allocation events below.
      const paidAmount = statusGroup === 'paid' ? totalDue
        : statusGroup === 'partially_paid' ? Math.min(recordedPayment, totalDue) : 0;
      events.push({
        id: `rental-${rental.id}`,
        rentalId: rental.id,
        customer,
        vehicle,
        type: 'rental',
        typeLabel: 'Rental',
        statusGroup,
        displayStatus: rental.payment_status || 'pending',
        amount,
        cashImpact: paidAmount,
        outstandingAmount: statusGroup === 'pending' ? totalDue : Math.max(0, totalDue - paidAmount),
        detail: [
          `Rental ${formatRentalDate(rental.pickup_date, rental.pickup_time)} to ${formatRentalDate(rental.return_date, rental.return_time)}`,
          paymentSourceDetail(rental),
        ].filter(Boolean).join(' • '),
        date: rental.paid_at || rental.updated_at || rental.created_at,
      });

      if (Number(rental.security_deposit || 0) > 0 && !allocationHolderIds.has(rental.id)) {
        const depositStatus = String(rental.deposit_status || 'pending').toLowerCase();
        const depositCollected = ['held', 'adjustment_refund_due', 'release_pending', 'released', 'transferred'].includes(depositStatus);
        events.push({
          id: `deposit-${rental.id}`,
          rentalId: rental.id,
          customer,
          vehicle,
          type: 'deposit',
          typeLabel: 'Security Deposit',
          statusGroup: depositCollected ? 'paid' : normalizeLedgerStatus(depositStatus),
          displayStatus: depositStatus,
          amount: Number(rental.security_deposit || 0),
          cashImpact: depositCollected ? Number(rental.security_deposit || 0) : 0,
          outstandingAmount: depositCollected ? 0 : Number(rental.security_deposit || 0),
          detail: [paymentSourceDetail(rental), rental.deposit_release_error].filter(Boolean).join(' • '),
          date: rental.paid_at || rental.updated_at || rental.created_at,
        });
        if (Number(rental.deposit_released_amount || 0) > 0) {
          events.push({
            id: `deposit-refund-${rental.id}`,
            rentalId: rental.id,
            customer,
            vehicle,
            type: 'refund',
            typeLabel: 'Deposit Refund',
            statusGroup: 'refunded',
            displayStatus: depositStatus === 'released' ? 'refunded' : depositStatus,
            amount: -Number(rental.deposit_released_amount || 0),
            cashImpact: -Number(rental.deposit_released_amount || 0),
            outstandingAmount: 0,
            detail: [paymentSourceDetail(rental), rental.deposit_release_reason].filter(Boolean).join(' • '),
            date: rental.deposit_released_at || rental.updated_at || rental.created_at,
          });
        }
      }
    });

  depositAllocations.forEach((allocation) => {
    const { customer, vehicle } = contextFor(allocation, allocation.holder_rental_id);
    const amountHeld = Number(allocation.amount_held || 0);
    const amountReleased = Number(allocation.amount_released || 0);
    const rawStatus = String(allocation.status || 'held').toLowerCase();
    events.push({
      id: `allocation-${allocation.id}`,
      rentalId: allocation.holder_rental_id,
      customer,
      vehicle,
      type: 'deposit',
      typeLabel: 'Security Deposit',
      statusGroup: rawStatus === 'failed' ? 'failed' : 'paid',
      displayStatus: rawStatus,
      amount: amountHeld,
      cashImpact: amountHeld,
      outstandingAmount: 0,
      detail: [
        prettyStatus(allocation.source_kind || 'deposit'),
        paymentSourceDetail(allocation),
        allocation.last_error,
      ].filter(Boolean).join(' • '),
      date: allocation.created_at,
    });
    if (amountReleased > 0) {
      events.push({
        id: `allocation-refund-${allocation.id}`,
        rentalId: allocation.holder_rental_id,
        customer,
        vehicle,
        type: 'refund',
        typeLabel: 'Deposit Refund',
        statusGroup: 'refunded',
        displayStatus: rawStatus === 'released' ? 'refunded' : rawStatus,
        amount: -amountReleased,
        cashImpact: -amountReleased,
        outstandingAmount: 0,
        detail: [paymentSourceDetail(allocation), shortPaymentReference(allocation.refund_id, 'Refund')].filter(Boolean).join(' • '),
        date: allocation.updated_at || allocation.created_at,
      });
    }
  });

  extensionRequests
    .filter((request) => (
      ['approved_pending_payment', 'activated'].includes(request.status)
      || ['pending', 'paid'].includes(String(request.payment_status || '').toLowerCase())
    ))
    .filter((request) => (
      !request.stripe_payment_intent_id || !ledgerPaymentIntents.has(request.stripe_payment_intent_id)
    ) && (
      !request.stripe_checkout_session_id || !ledgerCheckoutSessions.has(request.stripe_checkout_session_id)
    ))
    .forEach((request) => {
      const { customer, vehicle } = contextFor(request, request.rental_id);
      const statusGroup = request.status === 'activated' ? 'paid' : normalizeLedgerStatus(request.payment_status);
      const totalDue = Number(request.extension_total_amount || 0);
      const recordedPayment = Number(request.payment_amount_cents || 0) / 100;
      const paidAmount = statusGroup === 'paid' ? (recordedPayment || totalDue)
        : statusGroup === 'partially_paid' ? recordedPayment : 0;
      events.push({
        id: `extension-${request.id}`,
        rentalId: request.rental_id,
        customer,
        vehicle,
        type: 'extension',
        typeLabel: request.request_kind === 'switch_car_continuation' ? 'Vehicle Switch' : 'Extension',
        statusGroup,
        displayStatus: request.payment_status || request.status,
        amount: statusGroup === 'partially_paid' && recordedPayment > 0 ? recordedPayment : totalDue,
        cashImpact: paidAmount,
        outstandingAmount: statusGroup === 'pending' ? totalDue : Math.max(0, totalDue - paidAmount),
        detail: [
          `Through ${formatRentalDate(request.requested_return_date, request.requested_return_time)}`,
          paymentSourceDetail(request),
        ].filter(Boolean).join(' • '),
        date: request.paid_at || request.updated_at || request.created_at,
      });
    });

  rentalCharges
    .filter((charge) => !charge.included_in_initial_payment)
    .forEach((charge) => {
      const { customer, vehicle } = contextFor(charge, charge.rental_id);
      const statusGroup = normalizeLedgerStatus(charge.status);
      const totalDue = Number(charge.total_amount || 0);
      const recordedPayment = Number(charge.payment_amount_cents || 0) / 100;
      const paidAmount = statusGroup === 'paid' ? (recordedPayment || totalDue)
        : statusGroup === 'partially_paid' ? recordedPayment : 0;
      events.push({
        id: `charge-${charge.id}`,
        rentalId: charge.rental_id,
        customer,
        vehicle,
        type: 'charge',
        typeLabel: prettyStatus(charge.charge_type || 'Additional Charge'),
        statusGroup,
        displayStatus: charge.status || 'pending',
        amount: statusGroup === 'partially_paid' && recordedPayment > 0 ? recordedPayment : totalDue,
        cashImpact: paidAmount,
        outstandingAmount: ['pending', 'failed'].includes(statusGroup) ? Math.max(0, totalDue - paidAmount) : 0,
        detail: [
          charge.name,
          charge.description,
          paymentSourceDetail(charge),
          charge.last_admin_charge_error,
        ].filter(Boolean).join(' • '),
        date: charge.paid_at || charge.updated_at || charge.created_at,
      });
    });

  stripeReconciliationIssues.forEach((issue) => {
    const { customer, vehicle } = contextFor(issue, issue.rental_id);
    const rawStatus = String(issue.status || 'open').toLowerCase();
    const statusGroup = rawStatus === 'resolved' || rawStatus === 'refunded'
      ? (rawStatus === 'refunded' ? 'refunded' : 'paid')
      : rawStatus === 'processing' ? 'pending' : 'failed';
    const reference = issue.refund_id || issue.payment_intent_id || issue.checkout_session_id;
    events.push({
      id: `stripe-reconciliation-${issue.id}`,
      rentalId: issue.rental_id,
      customer: issue.rental_id ? customer : 'Unmatched Stripe transaction',
      vehicle: issue.rental_id ? vehicle : 'Review required',
      type: 'reconciliation',
      typeLabel: 'Stripe Reconciliation',
      statusGroup,
      displayStatus: rawStatus === 'open' ? 'action required' : rawStatus,
      amount: Number(issue.amount || 0),
      cashImpact: 0,
      outstandingAmount: 0,
      detail: [
        prettyStatus(issue.issue_type || 'payment reconciliation'),
        issue.error_message,
        shortPaymentReference(reference, issue.refund_id ? 'Refund' : 'Stripe'),
      ].filter(Boolean).join(' • '),
      date: issue.updated_at || issue.created_at,
    });
  });

  return events.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}
function paymentEventMatchesFilter(event, filter, typeFilter = 'all') {
  if (typeFilter !== 'all' && event.type !== typeFilter) return false;
  if (filter === 'attention') return ['pending', 'partially_paid', 'failed'].includes(event.statusGroup);
  if (filter === 'received') return event.statusGroup === 'paid';
  if (filter === 'refunds') return event.statusGroup === 'refunded' || event.type === 'refund';
  return true;
}
function normalizeLedgerStatus(status) {
  const normalized = String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['paid', 'succeeded', 'complete', 'completed', 'held', 'activated'].includes(normalized)) return 'paid';
  if (isPartialPaymentStatus(normalized)) return 'partially_paid';
  if (['refunded', 'released'].includes(normalized)) return 'refunded';
  if (['failed', 'canceled', 'cancelled'].includes(normalized)) return 'failed';
  if (normalized === 'waived') return 'waived';
  return 'pending';
}
function paymentSourceDetail(source) {
  const provider = String(source?.payment_provider || '').trim();
  const reference = shortPaymentReference(
    source?.stripe_payment_intent_id || source?.stripe_checkout_session_id,
    source?.stripe_payment_intent_id ? 'Payment' : 'Checkout'
  );
  return [provider ? prettyStatus(provider) : '', reference].filter(Boolean).join(' • ');
}
function shortPaymentReference(value, label) {
  const reference = String(value || '').trim();
  if (!reference) return '';
  return `${label} …${reference.slice(-8)}`;
}
function auditActionLabel(action) {
  const labels = {
    'admin.login': 'Admin signed in',
    'admin.logout': 'Admin signed out',
    'document.opened': 'Document opened',
    'security_deposit.manual_release_requested': 'Admin requested deposit refund',
    'security_deposit.automatic_release_requested': 'Automatic deposit refund requested',
    'security_deposit.release_failed': 'Deposit refund failed',
    'security_deposit.succeeded': 'Deposit refunded',
    'security_deposit.pending': 'Deposit refund pending',
    'identity_verification.started': 'Identity verification started',
    'identity_verification.processing': 'Identity verification processing',
    'identity_verification.verified': 'Identity verified',
    'identity_verification.requires_input': 'Identity verification needs retry',
    'identity_verification.canceled': 'Identity verification canceled',
    INSERT: 'Record added',
    UPDATE: 'Record updated',
    DELETE: 'Record deleted',
  };
  return labels[action] || prettyStatus(String(action || 'activity').replaceAll('.', '_'));
}
function tabTitle(tab) { return ({ dashboard:'Dashboard', queue:'Operations Queue', payments:'Payments', tolls:'Toll Operations', calendar:'Fleet Calendar', 'new-booking':'New Booking', rentals:'Rental Manager', customers:'Customers', vehicles:'Fleet Manager', documents:'Document Review', emails:'Communications', audit:'Audit Log', settings:'Settings' })[tab] || 'Admin Portal'; }
function money(value) { return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' }); }
function manualPaymentPreferenceLabel(preference) {
  return ({
    customer_link: 'Customer pays through the secure link',
    admin_stripe: 'Admin opens Stripe Checkout on this device',
    external: 'Admin records a cleared external payment',
    later: 'Payment method will be decided later',
  })[preference] || 'Customer pays through the secure link';
}
function manualPaymentPreferenceSummary(preference) {
  if (preference === 'admin_stripe') return 'Payment starts as due. Open secure Stripe Checkout from the Payment circle on the rental.';
  if (preference === 'external') return 'Payment starts as due. Record the exact cleared phone or external payment from the Payment circle.';
  if (preference === 'later') return 'Payment starts as due. Choose the collection method later from the Payment circle.';
  return 'Payment starts as due. The customer can finish payment and documents through the secure client link.';
}
function calculateAdminUnder25Deposit(baseDeposit, settings = DEFAULT_UNDER_25_PRICING) {
  const base = Math.max(0, Number(baseDeposit || 0));
  if (settings?.deposit_adjustment_enabled === false) return base;
  const adjustment = Math.max(0, Number(settings?.deposit_adjustment_value || 0));
  return settings?.deposit_adjustment_type === 'percentage'
    ? base * (1 + adjustment / 100)
    : base + adjustment;
}
function formatDecimalInput(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}
function discountLabel(code) {
  if (code?.discount_type === 'percentage') return `${Number(code.amount || 0)}% off`;
  return `${money(code?.amount)} off`;
}
function formatDateOnly(value) {
  if (!value) return '';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}
function formatEasternDateTimeInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
function easternDateTimeInputToIso(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const target = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  let guess = target;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    const rendered = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    guess += target - rendered;
  }
  return new Date(guess).toISOString();
}
function bookingProviderLabel(provider) {
  void provider;
  return 'Supabase';
}
function bookingProviderPath(provider) {
  void provider;
  return 'cars-2.html';
}
function formatEasternDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}
function promotionPlacementLabel(promotion) {
  const pageLabel = (page) => page === 'index.html' ? 'Home' : page === 'cars-2.html' ? 'Cars' : page;
  const placements = [];
  if (promotion.popup_enabled) placements.push(`Popup: ${(promotion.popup_pages || []).map(pageLabel).join(', ')}`);
  if (promotion.banner_enabled) placements.push(`Banner: ${(promotion.banner_pages || []).map(pageLabel).join(', ')}`);
  return placements.join(' • ') || 'No placement';
}
function promotionScheduleLabel(promotion) {
  const format = (value) => value ? new Date(value).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }) : 'Now';
  return `${promotion.starts_at ? `Starts ${format(promotion.starts_at)}` : 'Starts immediately'} • Ends ${format(promotion.ends_at)}`;
}
function promotionDisplayStatus(promotion) {
  if (!promotion.active) return 'Paused';
  const now = Date.now();
  const startsAt = promotion.starts_at ? new Date(promotion.starts_at).getTime() : Number.NEGATIVE_INFINITY;
  const endsAt = new Date(promotion.ends_at).getTime();
  if (now < startsAt) return 'Scheduled';
  if (!Number.isFinite(endsAt) || now >= endsAt) return 'Expired';
  return 'Live';
}
function extractSignatureImage(snapshot = '') {
  const match = String(snapshot).match(/Drawn Signature Image:\s*(data:image\/png;base64,[^\s]+)/);
  return match?.[1] || '';
}
function downloadAgreement(rental) {
  if (!rental?.agreement_snapshot) return;
  const signatureImage = extractSignatureImage(rental.agreement_snapshot);
  const printableText = String(rental.agreement_snapshot).replace(/Drawn Signature Image:\s*data:image\/png;base64,[^\s]+/, 'Drawn Signature Image: embedded below');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Rent Me CT Agreement</title><style>body{font-family:Arial,sans-serif;color:#172033;line-height:1.5;padding:32px;max-width:900px;margin:auto}pre{white-space:pre-wrap;font-family:inherit}.signature{margin-top:24px;border:1px solid #d6dee8;border-radius:10px;padding:16px}.signature img{max-width:420px;width:100%;height:auto;display:block}</style></head><body><pre>${escapeHtml(printableText)}</pre>${signatureImage ? `<div class="signature"><strong>Drawn Signature</strong><img src="${signatureImage}" alt="Drawn renter signature"></div>` : ''}</body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `rent-me-ct-agreement-${rental.id || 'signed'}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[char]);
}
function getRentalDays(start, end) { const a = new Date(`${start}T00:00:00`); const b = new Date(`${end}T00:00:00`); return Math.ceil((b - a) / (1000*60*60*24)); }
function formatRentalDate(date, time) { if (!date) return 'Pending'; return `${new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}${time ? ` ${time}` : ''}`; }
function isThisMonth(date) { if (!date) return false; const d = new Date(date); const n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); }
function adminCustomerAge(dateOfBirth, today = new Date()) {
  const [year, month, day] = String(dateOfBirth || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  const birthDate = new Date(year, month - 1, day);
  if (Number.isNaN(birthDate.getTime()) || birthDate > today) return null;
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age -= 1;
  return age;
}
function prettySmsDeliveryStatus(delivery) {
  const status = String(delivery?.status || 'unknown').replaceAll('_', ' ');
  const errorCode = delivery?.errorCode || delivery?.error_code;
  if (Number(errorCode) === 30034) return 'blocked — Twilio 30034, sending number is not registered for US A2P 10DLC';
  return errorCode ? `${status} — Twilio ${errorCode}` : status;
}
function getLateReturnState(returnDate, returnTime, status) {
  const normalizedStatus = String(status || '').toLowerCase();
  const due = parseRentMeCtDateTime(returnDate, returnTime);
  const terminal = ['completed', 'cancelled'].includes(normalizedStatus);
  const graceEnds = due ? new Date(due.getTime() + TURNAROUND_BUFFER_MINUTES * 60 * 1000) : null;
  const now = new Date();
  const reportedReturn = normalizedStatus === 'return_initiated';
  const overdue = !terminal && (
    normalizedStatus === 'overdue' ||
    (['active', 'rented'].includes(normalizedStatus) && graceEnds && now >= graceEnds)
  );
  return {
    due,
    graceEnds,
    inGrace: !terminal && ['active', 'rented'].includes(normalizedStatus) && due && graceEnds && now >= due && now < graceEnds,
    overdue,
    hardLocked: !terminal && (reportedReturn || overdue),
  };
}
function requiresPhysicalReturnLock(rental) {
  return getLateReturnState(rental?.return_date, rental?.return_time, rental?.status).hardLocked;
}
function isOverdue(returnDate, returnTime, status) { return getLateReturnState(returnDate, returnTime, status).overdue; }
function isDueSoon(returnDate, returnTime) {
  const due = parseRentMeCtDateTime(returnDate, returnTime);
  if (!due) return false;
  const hours = (due - new Date()) / 36e5;
  return hours > 0 && hours <= 30;
}
function isToday(date) { if (!date) return false; const due = new Date(`${date}T00:00:00`); const now = new Date(); return due.getFullYear() === now.getFullYear() && due.getMonth() === now.getMonth() && due.getDate() === now.getDate(); }
function isPaidRental(rental) {
  const paymentStatus = String(rental?.payment_status || '').toLowerCase();
  const status = String(rental?.status || '').toLowerCase();

  return paymentStatus === 'paid' && status !== 'cancelled';
}
function isPartialPaymentStatus(status) {
  const normalized = String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ['partial', 'partial_paid', 'partially_paid'].includes(normalized);
}
function normalizePaymentStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'paid') return 'paid';
  if (isPartialPaymentStatus(normalized)) return 'partially_paid';
  return 'pending';
}
function prettyStatus(status) { return String(status || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function identityMatchResults(profile = {}) {
  const status = String(profile.identity_verification_status || 'unverified').toLowerCase();
  const code = String(profile.identity_verification_error_code || '').toLowerCase();
  if (status === 'verified') {
    return [
      { label: 'Legal name', result: 'Match confirmed', tone: 'matched' },
      { label: 'Date of birth', result: 'Match confirmed', tone: 'matched' },
    ];
  }
  if (code === 'name_mismatch') {
    return [
      { label: 'Legal name', result: 'Does not match', tone: 'mismatch' },
      { label: 'Date of birth', result: 'Match confirmed', tone: 'matched' },
    ];
  }
  if (code === 'date_of_birth_mismatch') {
    return [
      { label: 'Legal name', result: 'Match confirmed', tone: 'matched' },
      { label: 'Date of birth', result: 'Does not match', tone: 'mismatch' },
    ];
  }
  if (code === 'identity_details_mismatch') {
    return [
      { label: 'Legal name', result: 'Does not match', tone: 'mismatch' },
      { label: 'Date of birth', result: 'Does not match', tone: 'mismatch' },
    ];
  }
  return [
    { label: 'Legal name', result: 'Not confirmed', tone: 'pending' },
    { label: 'Date of birth', result: 'Not confirmed', tone: 'pending' },
  ];
}
function docLabel(type) { return type === 'license' ? 'Driver License' : type === 'insurance' ? 'Insurance Policy' : prettyStatus(type); }
function prettyVehicleStatus(status) { return prettyStatus(status || 'available'); }
function operationalVehicleStatus(status) {
  const normalized = String(status || 'available').toLowerCase();
  return SYSTEM_VEHICLE_STATUSES.includes(normalized) ? 'available' : normalized;
}
function operationalVehicleStatusLabel(status) {
  return OPERATIONAL_VEHICLE_STATUS_OPTIONS.find(([key]) => key === operationalVehicleStatus(status))?.[1] || 'Out of Service';
}
function vehicleScheduleStatus(status) {
  const normalized = String(status || '').toLowerCase();
  return SYSTEM_VEHICLE_STATUSES.includes(normalized) ? normalized : '';
}
function vehicleScheduleStatusLabel(status) {
  const scheduleStatus = vehicleScheduleStatus(status);
  if (['rented', 'on_road'].includes(scheduleStatus)) return 'On the Road';
  return scheduleStatus === 'reserved' ? 'Reserved' : '';
}
function manualCalendarActionEntries(availabilityTypes) {
  return MANUAL_CALENDAR_ACTION_KEYS.map((key) => [key, availabilityTypes[key] || DEFAULT_AVAILABILITY_TYPES[key]]);
}
function calendarActionLabel(key, availabilityTypes) {
  if (key === 'available') return 'Clear Manual Block';
  return availabilityTypes[key]?.label || DEFAULT_AVAILABILITY_TYPES[key]?.label || prettyStatus(key);
}
function timeOptions() { const times=[]; for(let h=9; h<=21; h++){ const suffix=h>=12?'PM':'AM'; const dh=h>12?h-12:h; times.push(`${dh}:00 ${suffix}`); } return times; }
function calendarTimeOptions(currentValue = '') {
  const times = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    times.push(`${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`);
  }
  times.push('11:59 PM');
  if (currentValue && !times.includes(currentValue)) times.push(currentValue);
  return times;
}

createRoot(document.getElementById('root')).render(<PortalErrorBoundary><App /></PortalErrorBoundary>);
