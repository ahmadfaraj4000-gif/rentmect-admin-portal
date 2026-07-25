import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  UserRound,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { optimizeVehicleImage } from './lib/imageOptimizer';
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
const DEFAULT_NEW_VEHICLE_DEPOSIT = 300;
const DEFAULT_UNDER_25_PRICING = {
  id: true,
  deposit_adjustment_enabled: true,
  deposit_adjustment_type: 'fixed',
  deposit_adjustment_value: 200,
  rental_markup_percentage: 10,
};
const DOCUMENT_BUCKET = 'rental-documents';
const VEHICLE_IMAGE_BUCKET = 'vehicle-images';
const BLOCKING_RENTAL_STATUSES = ['pending', 'documents_needed', 'document_review', 'ready_for_pickup', 'approved', 'active', 'overdue', 'return_initiated', 'checkout_hold'];
const AVAILABILITY_RENTAL_STATUSES = [...BLOCKING_RENTAL_STATUSES, 'completed'];
const BLOCKING_VEHICLE_STATUSES = ['maintenance', 'unavailable', 'inactive'];
const TURNAROUND_BUFFER_MINUTES = 180;

const vehicleStatuses = ['available', 'maintenance', 'unavailable', 'inactive'];
const SYSTEM_VEHICLE_STATUSES = ['rented'];
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
  unavailable: { label: 'Unavailable', color: '#9f241f' },
  reserved: { label: 'Reserved', color: '#d0a017' },
  on_road: { label: 'On the Road', color: '#2f8f5b' },
  maintenance: { label: 'Maintenance', color: '#171717' },
};
const SITE_PAGE_OPTIONS = [
  { value: 'index.html', label: 'Home page (index.html)' },
  { value: 'cars.html', label: 'Cars page (cars.html)' },
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
    original_mileage: '', maintenance_interval_miles: String(DEFAULT_MAINTENANCE_INTERVAL),
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
  cta_url: 'cars.html',
  fine_print: '',
  starts_at: '',
  ends_at: '',
  popup_enabled: true,
  banner_enabled: true,
  popup_pages: ['index.html'],
  banner_pages: ['cars.html'],
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
      { label: 'Resend', href: 'https://resend.com/login' },
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

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [authMessage, setAuthMessage] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [notice, setNotice] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileAdminNav, setIsMobileAdminNav] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches);
  const [navCollapsed, setNavCollapsed] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches);
  const [mobileFabPosition, setMobileFabPosition] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      return JSON.parse(window.localStorage.getItem('rentmect_admin_mobile_fab_position') || 'null');
    } catch {
      return null;
    }
  });
  const mobileFabDragRef = useRef(null);
  const suppressFabClickRef = useRef(false);
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [rentalFilter, setRentalFilter] = useState('needs_action');

  const [profiles, setProfiles] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [pendingBookings, setPendingBookings] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [reports, setReports] = useState([]);
  const [extensionRequests, setExtensionRequests] = useState([]);
  const [emergencyExceptions, setEmergencyExceptions] = useState([]);
  const [depositAllocations, setDepositAllocations] = useState([]);
  const [rentalPayments, setRentalPayments] = useState([]);
  const [rentalCharges, setRentalCharges] = useState([]);
  const [paymentLoadError, setPaymentLoadError] = useState('');
  const [customerEmailTemplates, setCustomerEmailTemplates] = useState([]);
  const [smsTemplates, setSmsTemplates] = useState([]);
  const [discountCodes, setDiscountCodes] = useState([]);
  const [serviceFees, setServiceFees] = useState([]);
  const [under25Pricing, setUnder25Pricing] = useState(DEFAULT_UNDER_25_PRICING);
  const [under25PricingSaving, setUnder25PricingSaving] = useState(false);
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
      const validSaved = Object.fromEntries(Object.entries(saved || {}).filter(([, value]) => value && typeof value === 'object').map(([key, value]) => [key, {
        label: String(value.label || prettyStatus(key)),
        color: String(value.color || DEFAULT_AVAILABILITY_TYPES[key]?.color || '#171717'),
      }]));
      return { ...DEFAULT_AVAILABILITY_TYPES, ...validSaved };
    } catch {
      return DEFAULT_AVAILABILITY_TYPES;
    }
  });

  const [selectedRentalId, setSelectedRentalId] = useState('');
  const [manualBookingFocusId, setManualBookingFocusId] = useState('');
  const [replyText, setReplyText] = useState('');

  const [editingVehicleId, setEditingVehicleId] = useState('');
  const [editVehicleForm, setEditVehicleForm] = useState(null);

  const [manualBookingForm, setManualBookingForm] = useState({
    customerMode: 'existing',
    customerId: '',
    existingDateOfBirth: '',
    existingPhone: '',
    fullName: '',
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

  const [vehicleForm, setVehicleForm] = useState(createEmptyVehicleForm);
  const [discountForm, setDiscountForm] = useState({
    code: '',
    discount_type: 'percentage',
    amount: '',
    max_redemptions: '',
    starts_at: '',
    expires_at: '',
    active: true,
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

  function notify(text, type = 'info') {
    setNotice({ text, type });
    window.clearTimeout(notify.timeout);
    notify.timeout = window.setTimeout(() => setNotice(null), 5200);
  }

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
        return;
      }
      
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (error) {
        setIsAdminUser(false);
        return;
      }

      setIsAdminUser(data?.role === 'admin');
    }

    checkAdminRole();
  }, [session]);

  useEffect(() => {
    if (isAdminUser) loadAllData();
  }, [isAdminUser]);

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
    let refreshTimer;
    let calendarPoll;
    const refreshCalendarSourceOfTruth = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => loadAllData({ silent: true }), 150);
    };
    const calendarChannel = supabase
      .channel('admin-calendar-source-of-truth')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rentals' }, refreshCalendarSourceOfTruth)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_availability_blocks' }, refreshCalendarSourceOfTruth)
      .subscribe();
    calendarPoll = window.setInterval(refreshCalendarSourceOfTruth, 15 * 1000);

    return () => {
      window.clearTimeout(refreshTimer);
      window.clearInterval(calendarPoll);
      supabase.removeChannel(calendarChannel);
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

  const dashboard = useMemo(() => {
    const active = paidRentals.filter((r) => ['ready_for_pickup', 'approved', 'active', 'overdue', 'return_initiated'].includes(r.status));
    const dueSoon = paidRentals.filter((r) =>
      !['completed', 'cancelled'].includes(r.status) &&
      isDueSoon(r.return_date)
    );
    const overdue = paidRentals.filter((r) => isOverdue(r.return_date, r.status));
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
    extensionRequests,
    rentalCharges,
    depositAllocations,
  }), [rentals, rentalPayments, extensionRequests, rentalCharges, depositAllocations]);

  const filteredRentals = useMemo(() => {
    const q = search.toLowerCase().trim();
    return paidRentals.filter((r) =>
      rentalMatchesFilter(r, rentalFilter, { documents, extensionRequests, vehicles }) &&
      (!q ||
      [r.vehicles?.name, r.profiles?.full_name, r.profiles?.phone, r.profiles?.intended_vehicle_use, r.user_email, r.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
      )
    );
  }, [paidRentals, search, rentalFilter, documents, extensionRequests, vehicles]);

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

  async function loadAllData({ silent = false } = {}) {
    if (!silent) setLoading(true);
    const [profilesRes, vehiclesRes, rentalsRes, pendingBookingsRes, documentsRes, messagesRes, reportsRes, extensionsRes, emergencyExceptionsRes, depositAllocationsRes, discountCodesRes, serviceFeesRes, sitePromotionsRes, availabilityBlocksRes, under25PricingRes, auditLogsRes, rentalPaymentsRes, rentalChargesRes, customerEmailTemplatesRes, smsTemplatesRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('*')
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
          rentals(*, vehicles(*), profiles!rentals_user_id_profiles_fkey(*))
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
        .from('admin_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(750),

      supabase
        .from('rental_payments')
        .select('*, rentals(*, vehicles(*), profiles!rentals_user_id_profiles_fkey(*))')
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
    ]);

    if (profilesRes.data) setProfiles(profilesRes.data);
    if (vehiclesRes.data) setVehicles(vehiclesRes.data);
    if (rentalsRes.data) setRentals(rentalsRes.data);
    if (pendingBookingsRes.data) setPendingBookings(pendingBookingsRes.data);
    if (documentsRes.data) setDocuments(documentsRes.data);
    if (messagesRes.data) setMessages(messagesRes.data);
    if (reportsRes.data) setReports(reportsRes.data);
    if (extensionsRes.data) setExtensionRequests(extensionsRes.data);
    if (emergencyExceptionsRes.data) setEmergencyExceptions(emergencyExceptionsRes.data);
    if (depositAllocationsRes.data) setDepositAllocations(depositAllocationsRes.data);
    if (discountCodesRes.data) setDiscountCodes(discountCodesRes.data);
    if (serviceFeesRes.data) setServiceFees(serviceFeesRes.data);
    if (sitePromotionsRes.data) setSitePromotions(sitePromotionsRes.data);
    if (availabilityBlocksRes.data) setAvailabilityBlocks(availabilityBlocksRes.data);
    if (under25PricingRes.data) setUnder25Pricing(under25PricingRes.data);
    if (auditLogsRes.data) setAuditLogs(auditLogsRes.data);
    if (rentalPaymentsRes.data) setRentalPayments(rentalPaymentsRes.data);
    if (rentalChargesRes.data) setRentalCharges(rentalChargesRes.data);
    setPaymentLoadError(
      [rentalsRes.error, extensionsRes.error, depositAllocationsRes.error, rentalPaymentsRes.error, rentalChargesRes.error]
        .filter(Boolean)
        .map((error) => error.message)
        .join(' ')
    );
    if (customerEmailTemplatesRes.data) setCustomerEmailTemplates(customerEmailTemplatesRes.data);
    if (smsTemplatesRes.data) setSmsTemplates(smsTemplatesRes.data);
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
      notify('Rental marked active.', 'success');
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
      notify('Rental completed.', 'success');
      return;
    }

    if (status === 'cancelled') {
      const { error } = await supabase.rpc('admin_cancel_rental', {
        p_rental_id: id,
        p_reason: options.reason || 'Cancelled by admin',
      });
      if (error) return notify(error.message);
      applyLocalStatus();
      notify('Rental cancelled.', 'success');
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
    notify(`Rental set to ${prettyStatus(status)}.`, 'success');
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
    const { data: completedRental, error: inspectionError } = await supabase.rpc('admin_inspect_and_complete_rental_return', {
      p_rental_id: rental.id,
      p_ending_mileage: parseMileageInput(inspection.endingMileage),
      p_mileage_checked: Boolean(inspection.mileageChecked),
      p_fuel_checked: Boolean(inspection.fuelChecked),
      p_damage_checked: Boolean(inspection.damageChecked),
      p_damage_found: Boolean(inspection.damageFound),
      p_deposit_decision: depositDecision,
      p_notes: inspection.damageNote || null,
      p_vehicle_disposition: vehicleDisposition,
    });
    if (inspectionError) return notify(inspectionError.message);

    setRentals((current) => current.map((item) => item.id === rental.id ? {
      ...item,
      ...completedRental,
      vehicles: item.vehicles ? {
        ...item.vehicles,
        status: vehicleDisposition,
        current_mileage: parseMileageInput(inspection.endingMileage),
      } : item.vehicles,
    } : item));
    setVehicles((current) => current.map((vehicle) => vehicle.id === rental.vehicle_id ? {
      ...vehicle,
      status: vehicleDisposition,
      current_mileage: parseMileageInput(inspection.endingMileage),
    } : vehicle));
    notify(
      vehicleDisposition === 'available'
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

  async function recordTestPayment(rental) {
    const id = rental?.id;
    if (!id) return;
    const total = Number(rental.rental_total || 0) + Number(rental.service_fee_total || 0) + Number(rental.tax_amount || 0) + Number(rental.security_deposit || 0);
    const confirmed = window.confirm(`Record ${money(total)} as received outside Stripe? This marks the rental and deposit paid. Use only after confirming the customer actually paid.`);
    if (!confirmed) return;
    const { data, error } = await supabase.rpc('record_admin_local_rental_payment', {
      p_rental_id: id,
    });
    if (error) return notify(error.message);

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
      notify(`Local payment recorded. Admin SMS alert did not send: ${alertError?.message || alertData.error}`);
    } else {
      notify('Local payment recorded. Admin approval SMS sent.', 'success');
    }
  }

  async function decideExtension(id, approve) {
    const request = extensionRequests.find((item) => item.id === id);
    const customer = request?.rentals?.profiles?.full_name || 'this customer';
    const action = approve
      ? `Approve the extension for ${customer} through ${formatRentalDate(request?.requested_return_date, request?.requested_return_time)}? The dates will be held while payment is pending.`
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
    notify(approve ? 'Extension approved.' : 'Extension rejected.', 'success');
  }

  async function recordExtensionPayment(id) {
    const request = extensionRequests.find((item) => item.id === id);
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

  async function waiveRentalCharge(id) {
    const { data, error } = await supabase.rpc('admin_waive_rental_charge', { p_charge_id: id });
    if (error) return notify(error.message);
    setRentalCharges((current) => current.map((charge) => charge.id === id ? data : charge));
    notify('Charge waived.', 'success');
  }

  async function chargeRentalSavedCard(charge) {
    if (!charge?.id) return false;
    const confirmed = window.confirm(`Charge the customer's saved card ${money(charge.total_amount)} for “${charge.name}”? This attempts the charge immediately.`);
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
    const { error } = await supabase.from('vehicles').update({ status }).eq('id', id);
    if (error) return notify(error.message);
    setVehicles((current) => current.map((vehicle) =>
      vehicle.id === id ? { ...vehicle, status } : vehicle
    ));
    setRentals((current) => current.map((rental) =>
      rental.vehicle_id === id && rental.vehicles ? { ...rental, vehicles: { ...rental.vehicles, status } } : rental
    ));
    notify(`Vehicle set to ${prettyVehicleStatus(status)}.`, 'success');
  }

  async function updateVehiclePublished(id, published) {
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

  function startEditVehicle(vehicle) {
    setEditingVehicleId(vehicle.id);
    setEditVehicleForm({
      name: vehicle.name || '',
      brand: vehicle.brand || '',
      model: vehicle.model || '',
      vehicle_type: vehicle.vehicle_type || '',
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

  async function saveVehicleEdit(id) {
    if (!editVehicleForm) return;

    const originalMileage = parseMileageInput(editVehicleForm.original_mileage);
    const currentMileage = parseMileageInput(editVehicleForm.current_mileage);
    const lastServiceMileage = parseMileageInput(editVehicleForm.last_maintenance_mileage);
    if (originalMileage === null || currentMileage === null) return notify('Original and current mileage are required.');
    if (currentMileage < originalMileage) return notify('Current mileage cannot be below the original mileage.');
    if (lastServiceMileage !== null && lastServiceMileage > currentMileage) return notify('Last service mileage cannot be above the current odometer.');

    const { status, ...vehicleFields } = editVehicleForm;
    const { error } = await supabase
      .from('vehicles')
      .update({
        ...vehicleFields,
        ...(status ? { status } : {}),
        daily_rate: Number(editVehicleForm.daily_rate || 0),
        security_deposit: Number(editVehicleForm.security_deposit || 0),
        original_mileage: originalMileage,
        current_mileage: currentMileage,
        maintenance_interval_miles: Number(editVehicleForm.maintenance_interval_miles || DEFAULT_MAINTENANCE_INTERVAL),
        last_maintenance_mileage: lastServiceMileage,
        features: linesToList(editVehicleForm.features),
        image_urls: linesToList(editVehicleForm.image_urls),
      })
      .eq('id', id);

    if (error) return notify(error.message);

    setEditingVehicleId('');
    setEditVehicleForm(null);
    loadAllData();
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
    setDiscountForm((current) => ({ ...current, code: `RENTME-${randomPart}` }));
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
    };

    const { data, error } = await supabase
      .from('discount_codes')
      .insert(payload)
      .select('*')
      .single();
    if (error) return notify(error.message);

    setDiscountCodes((current) => [data, ...current]);
    setDiscountForm({ code: '', discount_type: 'percentage', amount: '', max_redemptions: '', starts_at: '', expires_at: '', active: true });
    notify('Discount code created.', 'success');
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

  function resetPromotionForm() {
    setEditingPromotionId('');
    setPromotionForm({ ...EMPTY_PROMOTION_FORM, popup_pages: ['index.html'], banner_pages: ['cars.html'] });
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
      badge_text: promotionForm.badge_text.trim() || 'SPECIAL OFFER',
      offer_value: promotionForm.offer_value.trim() || 'Offer',
      offer_suffix: promotionForm.offer_suffix.trim(),
      popup_kicker: promotionForm.popup_kicker.trim() || 'Limited-Time Special',
      popup_title: promotionForm.popup_title.trim() || promotionForm.name.trim(),
      popup_body: promotionForm.popup_body.trim() || 'Use the coupon code at checkout.',
      banner_title: promotionForm.banner_title.trim() || promotionForm.name.trim(),
      banner_body: promotionForm.banner_body.trim() || 'Use code',
      cta_label: promotionForm.cta_label.trim() || 'Choose Your Car',
      cta_url: promotionForm.cta_url.trim() || 'cars.html',
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

    if (selectedType === 'available') {
      const idsToClear = availabilityBlocks
        .filter((block) => block.vehicle_id === vehicleId && datesOverlap(block.start_date, block.end_date, availabilityBlockForm.start_date, availabilityBlockForm.end_date))
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
    if (type === 'available') {
      const idsToClear = availabilityBlocks
        .filter((block) => block.vehicle_id === vehicleId && datesOverlap(block.start_date, block.end_date, sortedDates[0], sortedDates[1]))
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
    const confirmed = window.confirm('Remove this calendar block?');
    if (!confirmed) return;
    const { error } = await supabase
      .from('vehicle_availability_blocks')
      .update({ active: false })
      .eq('id', id);
    if (error) return notify(availabilityTableError(error), 'error');
    setAvailabilityBlocks((current) => current.filter((block) => block.id !== id));
    notify('Availability block removed.', 'success');
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
    if (status === 'approved' && changedDocument) {
      await autoMarkReadyForPickup(changedDocument, updatedDocuments);
    }
    notify(`${prettyStatus(status)} ${docLabel(documents.find((document) => document.id === id)?.document_type || 'document')}.`, 'success');
  }

  async function autoMarkReadyForPickup(changedDocument, updatedDocuments) {
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
    }
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
    if (manualBookingForm.customerMode === 'new' && (!manualBookingForm.fullName.trim() || !manualBookingForm.email.trim() || !manualBookingForm.phone.trim() || !manualBookingForm.dateOfBirth)) {
      return notify('Enter the new customer’s name, email, phone, and date of birth.');
    }
    const deliveryNeedsText = ['text', 'both'].includes(manualBookingForm.onboardingDelivery);
    const deliveryPhone = manualBookingForm.customerMode === 'new' ? manualBookingForm.phone : manualBookingForm.existingPhone;
    if (deliveryNeedsText && !isValidUSPhone(deliveryPhone)) {
      return notify('Enter a valid 10-digit US mobile number before sending the secure link by text.');
    }
    if (!vehicle) return notify('Choose a vehicle.');

    const days = getRentalDays(manualBookingForm.pickupDate, manualBookingForm.returnDate);
    if (days < 1) return notify('Return date must be after pickup date.');

    const available = await isVehicleAvailable(vehicle.id, manualBookingForm.pickupDate, manualBookingForm.pickupTime, manualBookingForm.returnDate, manualBookingForm.returnTime);
    if (!available) return notify('Vehicle is not available for that pickup and return time.');

    setManualBookingSubmitting(true);
    const { data, error } = await supabase.functions.invoke('admin-manual-booking', {
      body: {
        customerMode: manualBookingForm.customerMode,
        customerId: manualBookingForm.customerId || undefined,
        customerDateOfBirth: manualBookingForm.existingDateOfBirth || undefined,
        customerPhone: manualBookingForm.customerMode === 'existing' ? manualBookingForm.existingPhone.trim() : undefined,
        driverInfo: {
          licenseNumber: manualBookingForm.driverLicenseNumber.trim(),
          licenseState: manualBookingForm.driverLicenseState.trim(),
          insuranceProvider: manualBookingForm.insuranceProvider.trim(),
          insurancePolicyNumber: manualBookingForm.insurancePolicyNumber.trim(),
        },
        customer: manualBookingForm.customerMode === 'new' ? {
          fullName: manualBookingForm.fullName.trim(),
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

    setManualBookingForm({ customerMode: 'existing', customerId: '', existingDateOfBirth: '', existingPhone: '', fullName: '', email: '', phone: '', dateOfBirth: '', address: '', driverLicenseNumber: '', driverLicenseState: '', insuranceProvider: '', insurancePolicyNumber: '', vehicleId: '', pickupDate: adminBookingDateOffset(0), returnDate: adminBookingDateOffset(1), pickupTime: '9:00 AM', returnTime: '9:00 AM', onboardingDelivery: 'both', paymentCollectionPreference: 'customer_link' });
    await loadAllData({ silent: true });
    setManualBookingFocusId(data?.rental?.id || '');
    setSelectedRentalId(data?.rental?.id || '');
    setRentalFilter('needs_action');
    setActiveTab('rentals');
    const deliveredBy = (data?.deliveryChannels || []).map((channel) => channel === 'text' ? 'text' : 'email').join(' and ');
    notify(`${data?.customerCreated ? 'Customer saved and booking created' : 'Booking created'}${data?.onboardingSent ? ` — secure completion link sent by ${deliveredBy}.` : ' — finish it in the focused procedure console.'}`, 'success');
    if (data?.onboardingWarning) notify(`Booking was saved, but one delivery method needs attention: ${data.onboardingWarning}`);
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
      notify(`Secure customer completion link sent by ${channels}.`, 'success');
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

  async function createAdminPaymentLink(rental, mode = 'copy') {
    const successUrl = `${CLIENT_PORTAL_URL}/?booking=${encodeURIComponent(rental.id)}&payment=stripe_success`;
    const cancelUrl = `${CLIENT_PORTAL_URL}/?booking=${encodeURIComponent(rental.id)}&payment=stripe_cancelled`;
    const { data, error } = await supabase.functions.invoke('stripe-web-hook', {
      body: { action: 'admin_create_checkout', rentalId: rental.id, successUrl, cancelUrl },
    });
    if (error || data?.error || !data?.url) {
      notify(data?.error || error?.message || 'Payment cannot start until verification, documents, and the agreement are complete.');
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

  async function addVehicle(event) {
    event.preventDefault();
    const originalMileage = parseMileageInput(vehicleForm.original_mileage);
    if (originalMileage === null) {
      notify('Enter the vehicle’s original odometer mileage.');
      return false;
    }
    const lastServiceMileage = parseMileageInput(vehicleForm.last_maintenance_mileage);
    if (lastServiceMileage !== null && lastServiceMileage > originalMileage) {
      notify('Last service mileage cannot be above the current odometer.');
      return false;
    }
    const { error } = await supabase.from('vehicles').insert({
      ...vehicleForm,
      daily_rate: Number(vehicleForm.daily_rate || 0),
      security_deposit: Number(vehicleForm.security_deposit || 0),
      original_mileage: originalMileage,
      current_mileage: originalMileage,
      maintenance_interval_miles: Number(vehicleForm.maintenance_interval_miles || DEFAULT_MAINTENANCE_INTERVAL),
      last_maintenance_mileage: lastServiceMileage ?? originalMileage,
      features: linesToList(vehicleForm.features),
      image_urls: linesToList(vehicleForm.image_urls),
    });
    if (error) {
      notify(error.message);
      return false;
    }
    const wasPublished = vehicleForm.published;
    setVehicleForm(createEmptyVehicleForm());
    await loadAllData();
    notify(wasPublished ? 'Vehicle added and published.' : 'Vehicle added as an unpublished draft.', 'success');
    return true;
  }

  async function sendManualReminder(rental, channel) {
    const customer = rental.profiles?.full_name || rental.profiles?.phone || rental.user_id;
    if (channel !== 'SMS') {
      notify(`${channel} reminder placeholder for ${customer}. Resend is still pending.`);
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
    { key: 'calendar', label: 'Calendar', icon: CalendarDays },
    { key: 'new-booking', label: 'New Booking', icon: CalendarClock },
    { key: 'rentals', label: 'Rentals', icon: KeyRound },
    { key: 'vehicles', label: 'Vehicles', icon: Car },
    { key: 'customers', label: 'Customers', icon: UserRound },
    { key: 'emails', label: 'Communications', icon: MessageCircle },
    { key: 'audit', label: 'Audit Log', icon: History },
    { key: 'settings', label: 'Settings', icon: Settings },
  ];

  function selectAdminTab(key) {
    setActiveTab(key);
    if (isMobileAdminNav) {
      setNavCollapsed(true);
    }
  }

  function handleMobileFabPointerDown(event) {
    if (typeof window === 'undefined' || !isMobileAdminNav) return;
    const rect = event.currentTarget.getBoundingClientRect();
    mobileFabDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      initialX: rect.left,
      initialY: rect.top,
      moved: false,
    };

    const moveFab = (moveEvent) => {
      const drag = mobileFabDragRef.current;
      if (!drag) return;
      const deltaX = moveEvent.clientX - drag.startX;
      const deltaY = moveEvent.clientY - drag.startY;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 8) drag.moved = true;
      const nextX = Math.min(Math.max(8, drag.initialX + deltaX), window.innerWidth - 64);
      const nextY = Math.min(Math.max(8, drag.initialY + deltaY), window.innerHeight - 64);
      drag.lastPosition = { x: nextX, y: nextY };
      setMobileFabPosition(drag.lastPosition);
    };

    const stopDragging = () => {
      const drag = mobileFabDragRef.current;
      if (drag?.moved) {
        suppressFabClickRef.current = true;
        setTimeout(() => { suppressFabClickRef.current = false; }, 0);
      }
      mobileFabDragRef.current = null;
      window.removeEventListener('pointermove', moveFab);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
      if (drag?.moved && drag.lastPosition) {
        window.localStorage.setItem('rentmect_admin_mobile_fab_position', JSON.stringify(drag.lastPosition));
      }
    };

    window.addEventListener('pointermove', moveFab);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
  }

  function toggleMobileNav(event) {
    if (suppressFabClickRef.current) return;
    setNavCollapsed(!navCollapsed);
    if (isMobileAdminNav) {
      event?.currentTarget?.blur();
    }
  }

  if (loading) return <Loading />;
  if (!session) return <Login authForm={authForm} setAuthForm={setAuthForm} handleLogin={handleLogin} authMessage={authMessage} showPassword={showAdminPassword} setShowPassword={setShowAdminPassword} handleForgotPassword={handleAdminForgotPassword} />;
  if (!isAdminUser) return <NotAdmin email={session.user.email} signOut={signOut} />;

  return (
    <div className={`admin-shell ${navCollapsed ? 'nav-collapsed' : ''}`}>
      <aside className={`sidebar ${navCollapsed ? 'collapsed' : ''}`} style={isMobileAdminNav && mobileFabPosition ? { left: `${mobileFabPosition.x}px`, top: `${mobileFabPosition.y}px`, right: 'auto', bottom: 'auto' } : undefined}>
        <div className="brand-block">
          <picture>
            <source media="(max-width: 760px)" srcSet={logoMobileUrl} />
            <img className="brand-logo" src={logoUrl} alt="Rent Me CT" />
          </picture>
        </div>
        <button className="nav-toggle" type="button" onPointerDown={handleMobileFabPointerDown} onClick={toggleMobileNav} aria-label={navCollapsed ? 'Expand navigation' : 'Collapse navigation'}>
          <Menu size={18} /><span>{navCollapsed ? 'Expand' : 'Collapse'}</span>
        </button>
        <nav className="side-nav">
          {adminTabs.map(({ key, label, icon: Icon }) => (
            <button key={key} className={activeTab === key ? 'active' : ''} onClick={() => selectAdminTab(key)} title={label}>
              <Icon size={18}/><span>{label}</span>
            </button>
          ))}
        </nav>
        <button className="logout-btn" onClick={signOut} title="Log Out"><LogOut size={18}/><span>Log Out</span></button>
      </aside>

      <main className="admin-main">
        {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}
        <header className="admin-header">
          <div><p className="eyebrow">Operations Center</p><h1>{tabTitle(activeTab)}</h1><span>{session.user.email}</span></div>
          <div className="header-actions"><AdminQuickLinks/><button onClick={loadAllData} className="secondary-btn">Refresh</button></div>
        </header>

        {activeTab === 'dashboard' && <Dashboard dashboard={dashboard} rentals={paidRentals} vehicles={vehicles} operationsQueue={operationsQueue} emergencyExceptions={emergencyExceptions} documents={documents} messages={messages} reports={reports} sendManualReminder={sendManualReminder} updateRentalStatus={updateRentalStatus} openDocument={openDocument} markDocument={markDocument} documentsByRentalId={documentsByRentalId} />}
        {activeTab === 'queue' && <OperationsQueue queue={operationsQueue} updateRentalStatus={updateRentalStatus} recordTestPayment={recordTestPayment} openDocument={openDocument} markDocument={markDocument} decideExtension={decideExtension} recordExtensionPayment={recordExtensionPayment} />}
        {activeTab === 'payments' && <PaymentsTab paymentEvents={paymentEvents} paymentFilter={paymentFilter} setPaymentFilter={setPaymentFilter} rentals={rentals} loadError={paymentLoadError} />}
        {activeTab === 'calendar' && <FleetCalendar vehicles={vehicles} rentals={rentals} availabilityBlocks={availabilityBlocks} availabilityBlockForm={availabilityBlockForm} setAvailabilityBlockForm={setAvailabilityBlockForm} editingAvailabilityBlockId={editingAvailabilityBlockId} availabilitySaving={availabilitySaving} availabilityTypes={availabilityTypes} createAvailabilityBlock={createAvailabilityBlock} createAvailabilityPaintBlock={createAvailabilityPaintBlock} updateAvailabilityBlock={updateAvailabilityBlock} editAvailabilityBlock={editAvailabilityBlock} deleteAvailabilityBlock={deleteAvailabilityBlock} />}
        {activeTab === 'new-booking' && <ManualBooking manualBookingForm={manualBookingForm} setManualBookingForm={setManualBookingForm} profiles={profiles} vehicles={vehicles} rentals={rentals} pendingBookings={pendingBookings} availabilityBlocks={availabilityBlocks} under25Pricing={under25Pricing} serviceFees={serviceFees.filter((fee) => fee.active)} createManualBooking={createManualBooking} submitting={manualBookingSubmitting} />}
        {activeTab === 'rentals' && <Rentals rentals={manualBookingFocusId ? rentals.filter((rental) => rental.id === manualBookingFocusId) : filteredRentals} focusRentalId={manualBookingFocusId} clearRentalFocus={() => setManualBookingFocusId('')} search={search} setSearch={setSearch} rentalFilter={rentalFilter} setRentalFilter={setRentalFilter} updateRentalStatus={updateRentalStatus} completeRentalReturn={completeRentalReturn} releaseSecurityDeposit={releaseSecurityDeposit} recordLocalDepositRelease={recordLocalDepositRelease} depositAllocations={depositAllocations} recordTestPayment={recordTestPayment} recordExtensionPayment={recordExtensionPayment} cancelApprovedExtension={cancelApprovedExtension} extensionRequests={extensionRequests} emergencyExceptions={emergencyExceptions} emergencyAuthorized={Boolean(profiles.find((profile) => profile.id === session?.user?.id)?.emergency_override_authorized)} activateRentalWithEmergencyException={activateRentalWithEmergencyException} resolveEmergencyExceptionScope={resolveEmergencyExceptionScope} vehicles={vehicles} reports={reports} decideExtension={decideExtension} sendManualReminder={sendManualReminder} openDocument={openDocument} markDocument={markDocument} deleteDocument={deleteDocument} documents={documents} documentsByRentalId={documentsByRentalId} rentalCharges={rentalCharges} addRentalCharge={addRentalCharge} waiveRentalCharge={waiveRentalCharge} chargeRentalSavedCard={chargeRentalSavedCard} emailTemplates={customerEmailTemplates} smsTemplates={smsTemplates} notify={notify} sendBookingCompletionLink={sendBookingCompletionLink} uploadAdminBookingDocument={uploadAdminBookingDocument} createAdminPaymentLink={createAdminPaymentLink} />}
        {activeTab === 'customers' && <Customers profiles={profiles} rentals={rentals} documentsByUserId={documentsByUserId} documents={documents} reports={reports} openDocument={openDocument} emailTemplates={customerEmailTemplates} smsTemplates={smsTemplates} notify={notify} />}
        {activeTab === 'emails' && <ContactCenterTab profiles={profiles} rentals={rentals} messages={messages} selectedRental={selectedRental} onSelectThread={selectCommunicationThread} replyText={replyText} setReplyText={setReplyText} sendReply={sendReply} adminEmail={session.user.email} notify={notify} onTemplatesChanged={() => loadAllData({ silent: true })} />}
        {activeTab === 'vehicles' && <Vehicles vehicles={vehicles} vehicleForm={vehicleForm} setVehicleForm={setVehicleForm} addVehicle={addVehicle} updateVehicleStatus={updateVehicleStatus} updateVehiclePublished={updateVehiclePublished} markVehicleServiced={markVehicleServiced} editingVehicleId={editingVehicleId} editVehicleForm={editVehicleForm} setEditVehicleForm={setEditVehicleForm} startEditVehicle={startEditVehicle} cancelEditVehicle={cancelEditVehicle} saveVehicleEdit={saveVehicleEdit} deleteVehicle={deleteVehicle} availabilityTypes={availabilityTypes} notify={notify} />}
        {activeTab === 'damage' && <DamageCases reports={reports} updateDamageCase={updateDamageCase} setCustomerStatus={setCustomerStatus} />}
        {activeTab === 'documents' && <Documents documents={documents} markDocument={markDocument} openDocument={openDocument} deleteDocument={deleteDocument} />}
        {activeTab === 'audit' && <AuditLog auditLogs={auditLogs} />}
        {activeTab === 'settings' && <SettingsTab discountCodes={discountCodes} discountForm={discountForm} setDiscountForm={setDiscountForm} generateDiscountCode={generateDiscountCode} createDiscountCode={createDiscountCode} toggleDiscountCode={toggleDiscountCode} deleteDiscountCode={deleteDiscountCode} sitePromotions={sitePromotions} promotionForm={promotionForm} setPromotionForm={setPromotionForm} editingPromotionId={editingPromotionId} saveSitePromotion={saveSitePromotion} editSitePromotion={editSitePromotion} resetPromotionForm={resetPromotionForm} toggleSitePromotion={toggleSitePromotion} deleteSitePromotion={deleteSitePromotion} serviceFees={serviceFees} serviceFeeForm={serviceFeeForm} setServiceFeeForm={setServiceFeeForm} createServiceFee={createServiceFee} toggleServiceFee={toggleServiceFee} deleteServiceFee={deleteServiceFee} under25Pricing={under25Pricing} setUnder25Pricing={setUnder25Pricing} saveUnder25Pricing={saveUnder25Pricing} removeUnder25DepositAdjustment={removeUnder25DepositAdjustment} under25PricingSaving={under25PricingSaving} availabilityTypes={availabilityTypes} updateAvailabilityType={updateAvailabilityType} />}
      </main>
    </div>
  );
}

function Dashboard({ dashboard, rentals, vehicles, operationsQueue, emergencyExceptions = [], documents, messages, reports, sendManualReminder, updateRentalStatus, openDocument, markDocument, documentsByRentalId }) {
  const recentRentals = rentals.slice(0, 5);
  const paidRentalIds = new Set(rentals.map((rental) => rental.id));
  const paidDocuments = documents.filter((document) => paidRentalIds.has(document.rental_id || document.rentals?.id));
  const paidMessages = messages.filter((message) => paidRentalIds.has(message.rental_id || message.rentals?.id));
  const paidReports = reports.filter((report) => paidRentalIds.has(report.rental_id || report.rentals?.id));
  const maintenanceDue = vehicles.filter((vehicle) => getVehicleMaintenanceState(vehicle).due).length;
  const openEmergencyExceptions = emergencyExceptions.filter((item) => item.status === 'active');
  return <>
    <section className="metric-grid">
      <Metric icon={Car} label="Cars Out" value={dashboard.active.length} />
      <Metric icon={AlertTriangle} label="Overdue" value={dashboard.overdue.length} danger={dashboard.overdue.length > 0} />
      <Metric icon={Wrench} label="Maintenance Due" value={maintenanceDue} danger={maintenanceDue > 0} />
      <Metric icon={Banknote} label="Month Revenue" value={money(dashboard.monthRevenue)} />
      <Metric icon={CreditCard} label="Active Deposits" value={money(dashboard.deposits)} />
    </section>
    {openEmergencyExceptions.length > 0 && <section className="dashboard-emergency-exceptions">
      <div><AlertTriangle size={21}/><strong>{openEmergencyExceptions.length} emergency exception{openEmergencyExceptions.length === 1 ? '' : 's'} require follow-up</strong></div>
      {openEmergencyExceptions.slice(0, 5).map((item) => {
        const rental = rentals.find((candidate) => candidate.id === item.rental_id);
        const expired = new Date(item.expires_at).getTime() <= Date.now();
        return <span className={expired ? 'expired' : ''} key={item.id}>{expired ? 'EXPIRED — ' : ''}{rental?.profiles?.full_name || item.rentals?.profiles?.full_name || 'Customer'} • {(item.exception_scopes || []).map(prettyStatus).join(', ')} • due {new Date(item.expires_at).toLocaleString()}</span>;
      })}
    </section>}
    <section className="content-grid">
      <Panel title="Due Soon / Overdue" eyebrow="Return Monitor">
        {dashboard.dueSoon.length === 0 && dashboard.overdue.length === 0 && <p className="muted">No due-soon rentals right now.</p>}
        {[...dashboard.overdue, ...dashboard.dueSoon].slice(0, 6).map((r) => <ReturnMonitorRow key={r.id} rental={r} sendManualReminder={sendManualReminder} />)}
      </Panel>
      <Panel title="Action Queue" eyebrow="What Needs Review">
        <QueueItem icon={CreditCard} label="Payments needed" value={operationsQueue.filter((item) => item.bucket === 'payment_needed').length} />
        <QueueItem icon={FileText} label="Documents uploaded" value={paidDocuments.filter(d => d.status === 'pending_review').length} />
        <QueueItem icon={MessageCircle} label="Client messages" value={paidMessages.filter(m => m.sender_role === 'client' && !m.read_by_admin).length} />
        <QueueItem icon={Wrench} label="Open reports" value={paidReports.filter(r => r.status === 'open').length} />
      </Panel>
    </section>
    <Panel title="Recent Rentals" eyebrow="Latest Activity">
      {recentRentals.map((r) => <RentalRow key={r.id} rental={r} updateRentalStatus={updateRentalStatus} sendManualReminder={sendManualReminder} rentalDocuments={documentsByRentalId[r.id] || []} allDocuments={documents} openDocument={openDocument} markDocument={markDocument} />)}
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
          {item.extension && item.extension.status === 'pending' && <button className="approve" onClick={() => decideExtension(item.extension.id, true)}><CheckCircle2 size={16}/> Approve</button>}
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

function PaymentsTab({ paymentEvents, paymentFilter, setPaymentFilter, rentals, loadError = '' }) {
  const collected = paymentEvents.reduce((sum, event) => sum + Math.max(0, Number(event.cashImpact || 0)), 0);
  const refunded = paymentEvents.reduce((sum, event) => sum + Math.abs(Math.min(0, Number(event.cashImpact || 0))), 0);
  const outstanding = paymentEvents.reduce((sum, event) => sum + Math.max(0, Number(event.outstandingAmount || 0)), 0);
  const depositsHeld = rentals.filter((rental) => ['held', 'adjustment_refund_due', 'release_pending'].includes(String(rental.deposit_status || '').toLowerCase()));
  const visibleEvents = paymentEvents.filter((event) => paymentEventMatchesFilter(event, paymentFilter));

  return <>
    <section className="metric-grid payments-metrics">
      <Metric icon={DollarSign} label="Gross Collected" value={money(collected)} />
      <Metric icon={ReceiptText} label="Refunded" value={money(refunded)} />
      <Metric icon={Clock} label="Outstanding" value={money(outstanding)} danger={outstanding > 0} />
      <Metric icon={ReceiptText} label="Deposits Held" value={money(depositsHeld.reduce((sum, rental) => sum + Number(rental.deposit_held_amount || 0), 0))} />
    </section>
    <Panel title="Payments" eyebrow="Payment Activity">
      {loadError && <p className="form-error" role="alert">Some payment sources could not be loaded: {loadError}</p>}
      <div className="filter-pills" role="group" aria-label="Payment filters">
        {[
          ['all', 'All'],
          ['paid', 'Paid'],
          ['partially_paid', 'Partially Paid'],
          ['pending', 'Pending'],
          ['refunded', 'Refunded'],
          ['failed', 'Failed'],
          ['deposit', 'Deposits'],
          ['rental', 'Rentals'],
          ['extension', 'Extensions'],
          ['charge', 'Charges'],
        ].map(([key, label]) => (
          <button key={key} type="button" className={paymentFilter === key ? 'active' : ''} onClick={() => setPaymentFilter(key)}>{label}</button>
        ))}
      </div>
      <div className="payments-table">
        <div className="payments-table-head">
          <span>Customer</span>
          <span>Vehicle</span>
          <span>Type</span>
          <span>Status</span>
          <span>Amount</span>
          <span>Date</span>
        </div>
        {visibleEvents.length === 0 && <p className="muted">No payment activity matches this filter.</p>}
        {visibleEvents.map((event) => (
          <div className="payments-table-row" key={event.id}>
            <span><strong>{event.customer}</strong><small>{event.detail}</small></span>
            <span>{event.vehicle}</span>
            <span>{event.typeLabel || prettyStatus(event.type)}</span>
            <span><em className={event.statusGroup === 'paid' ? 'active-status' : 'paused-status'}>{prettyStatus(event.displayStatus || event.statusGroup)}</em></span>
            <span>{money(event.amount)}</span>
            <span>{event.date ? new Date(event.date).toLocaleDateString() : '—'}</span>
          </div>
        ))}
      </div>
    </Panel>
  </>;
}

function FleetCalendar({ vehicles, rentals, availabilityBlocks, availabilityBlockForm, setAvailabilityBlockForm, editingAvailabilityBlockId, availabilitySaving, availabilityTypes, createAvailabilityBlock, createAvailabilityPaintBlock, updateAvailabilityBlock, editAvailabilityBlock, deleteAvailabilityBlock }) {
  const days = calendarDays(28);
  const [paintRange, setPaintRange] = useState(null);
  const [paintModal, setPaintModal] = useState(null);
  const [calendarHint, setCalendarHint] = useState('');
  const updateBlock = (key, value) => setAvailabilityBlockForm({ ...availabilityBlockForm, [key]: value });
  const rentalsByVehicle = useMemo(() => {
    const grouped = {};
    rentals.filter((r) => AVAILABILITY_RENTAL_STATUSES.includes(String(r.status || '').toLowerCase())).forEach((r) => {
      if (!grouped[r.vehicle_id]) grouped[r.vehicle_id] = [];
      grouped[r.vehicle_id].push(r);
    });
    return grouped;
  }, [rentals]);

  const blocksByVehicle = useMemo(() => {
    const grouped = {};
    availabilityBlocks.forEach((block) => {
      if (String(block.block_type || '').toLowerCase() === 'available') return;
      if (!grouped[block.vehicle_id]) grouped[block.vehicle_id] = [];
      grouped[block.vehicle_id].push(block);
    });
    return grouped;
  }, [availabilityBlocks]);

  const activeVehicle = vehicles.find((vehicle) => vehicle.id === availabilityBlockForm.vehicle_id) || vehicles[0];
  const selectedType = availabilityBlockForm.block_type || 'unavailable';
  const selectedTypeStyle = availabilityTypes[selectedType] || DEFAULT_AVAILABILITY_TYPES[selectedType] || { label: prettyStatus(selectedType), color: '#394852' };

  function openBlockEdit(block) {
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
          label: selectedTypeStyle.label,
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
      label: selectedTypeStyle.label,
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
        <span>Bookings update this grid automatically. Return-day cells show the due-back time and become bookable after the three-hour turnaround. Available clears manual blocks only.</span>
      </div>
      <button type="button" className="secondary-btn" onClick={() => updateBlock('start_date', new Date().toISOString().split('T')[0])}><CalendarClock size={16}/> Today</button>
    </div>
    {calendarHint && <div className="calendar-hint"><AlertTriangle size={16}/><span>{calendarHint}</span></div>}

    <form className="availability-form" onSubmit={createAvailabilityBlock}>
      <select value={availabilityBlockForm.vehicle_id || activeVehicle?.id || ''} onChange={(event) => updateBlock('vehicle_id', event.target.value)} required>
        <option value="">Choose vehicle</option>
        {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}
      </select>
      <select value={availabilityBlockForm.block_type} onChange={(event) => updateBlock('block_type', event.target.value)}>
        {Object.entries(availabilityTypes).map(([key, type]) => <option key={key} value={key}>{type.label}</option>)}
      </select>
      <input type="date" value={availabilityBlockForm.start_date} onChange={(event) => updateBlock('start_date', event.target.value)} required />
      <input type="date" value={availabilityBlockForm.end_date} onChange={(event) => updateBlock('end_date', event.target.value)} required />
      <select value={availabilityBlockForm.start_time} onChange={(event) => updateBlock('start_time', event.target.value)}>{calendarTimeOptions(availabilityBlockForm.start_time).map((time) => <option key={time} value={time}>{time}</option>)}</select>
      <select value={availabilityBlockForm.end_time} onChange={(event) => updateBlock('end_time', event.target.value)}>{calendarTimeOptions(availabilityBlockForm.end_time).map((time) => <option key={time} value={time}>{time}</option>)}</select>
      <button className="primary-btn" disabled={availabilitySaving}><Plus size={16}/> {availabilitySaving ? 'Saving…' : editingAvailabilityBlockId ? 'Save Block' : 'Add Block'}</button>
    </form>

    <div className="availability-legend" aria-label="Calendar paint colors">
      {Object.entries(availabilityTypes).map(([key, type]) => (
        <button
          type="button"
          key={key}
          className={selectedType === key ? 'active' : ''}
          onClick={() => updateBlock('block_type', key)}
          title={`Paint ${type.label}`}
        >
          <span className={key === 'available' ? 'clear-swatch' : ''} style={{ backgroundColor: type.color }} />
          {type.label}
        </button>
      ))}
      <em>Drag across open dates to add a block. Click any colored time segment to edit it.</em>
    </div>

    <div className="calendar-scroller">
      <div className="fleet-calendar">
        <div className="calendar-cell calendar-head sticky-col">Vehicle</div>
        {days.map((day) => <div className="calendar-cell calendar-head" key={day.iso}><strong>{day.weekday}</strong><span>{day.shortLabel}</span></div>)}
        {vehicles.map((vehicle) => {
          const vehicleRentals = rentalsByVehicle[vehicle.id] || [];
          const vehicleBlocks = blocksByVehicle[vehicle.id] || [];
          const vehicleBlocked = BLOCKING_VEHICLE_STATUSES.includes(String(vehicle.status || '').toLowerCase());
          return <React.Fragment key={vehicle.id}>
            <div className="calendar-cell sticky-col vehicle-name">
              <strong>{vehicle.name}</strong>
              <span>{prettyVehicleStatus(vehicle.status)}</span>
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
                style={previewColor ? { '--block-color': previewColor } : undefined}
                onMouseDown={() => {
                  if (segments.length) return;
                  startPaint(vehicle.id, day.iso);
                }}
                onMouseEnter={() => updatePaint(vehicle.id, day.iso)}
                onMouseUp={() => !segments.length && finishPaint(vehicle.id, day.iso)}
              >
                {segments.map((segment) => <button
                  type="button"
                  className={`calendar-time-segment ${segment.kind}`}
                  key={segment.id}
                  title={segment.title}
                  aria-label={segment.kind === 'grace' ? `Protected three-hour turnaround until ${formatTimeOnly(segment.standardAvailableAt)}.` : `${segment.label}. Click to edit.`}
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

function AvailabilityBlockModal({ modal, setModal, vehicles, availabilityTypes, onCancel, onSave }) {
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
    <form className="admin-modal availability-modal" role="dialog" aria-modal="true" aria-label="Calendar availability block" onSubmit={(event) => {
      event.preventDefault();
      onSave(modal);
    }}>
      <div className="admin-modal-header">
        <CalendarClock size={22}/>
        <div>
          <strong>{modal.mode === 'edit' ? 'Edit Calendar Block' : isClear ? 'Clear Availability Blocks' : 'Confirm Calendar Block'}</strong>
          <span>{isClear ? 'Available removes manual color blocks only. It cannot remove a rental’s three-hour turnaround.' : 'Adjust the vehicle, dates, and label before saving.'}</span>
        </div>
      </div>
      <div className="availability-modal-grid">
        <label><span>Vehicle</span><select value={modal.vehicleId} onChange={(event) => update('vehicleId', event.target.value)}>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}</select></label>
        <label><span>Label</span><select value={modal.blockType} onChange={(event) => update('blockType', event.target.value)}>{Object.entries(availabilityTypes).map(([key, type]) => <option key={key} value={key}>{type.label}</option>)}</select></label>
        <label><span>Start date</span><input type="date" value={modal.startDate} onChange={(event) => update('startDate', event.target.value)} /></label>
        <label><span>End date</span><input type="date" value={modal.endDate} onChange={(event) => update('endDate', event.target.value)} /></label>
        {!isClear && <label><span>Start time</span><select value={modal.startTime} onChange={(event) => update('startTime', event.target.value)}>{calendarTimeOptions(modal.startTime).map((time) => <option key={time} value={time}>{time}</option>)}</select></label>}
        {!isClear && <label><span>End time</span><select value={modal.endTime} onChange={(event) => update('endTime', event.target.value)}>{calendarTimeOptions(modal.endTime).map((time) => <option key={time} value={time}>{time}</option>)}</select></label>}
      </div>
      <div className="availability-modal-swatch"><span className={isClear ? 'clear-swatch' : ''} style={{ backgroundColor: selectedType.color }} />{selectedType.label}</div>
      {modal.error && <p className="form-error">{modal.error}</p>}
      <div className="modal-actions">
        <button type="button" className="secondary-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary-btn" disabled={modal.saving}>{modal.saving ? 'Saving...' : isClear ? 'OK - Clear Dates' : 'OK - Apply Changes'}</button>
      </div>
    </form>
  </div>;
}

function Rentals({ rentals, focusRentalId, clearRentalFocus, search, setSearch, rentalFilter, setRentalFilter, updateRentalStatus, completeRentalReturn, releaseSecurityDeposit, recordLocalDepositRelease, depositAllocations = [], recordTestPayment, recordExtensionPayment, cancelApprovedExtension, extensionRequests, emergencyExceptions = [], emergencyAuthorized, activateRentalWithEmergencyException, resolveEmergencyExceptionScope, vehicles, reports, decideExtension, sendManualReminder, openDocument, markDocument, deleteDocument, documents = [], documentsByRentalId, rentalCharges = [], addRentalCharge, waiveRentalCharge, chargeRentalSavedCard, emailTemplates = [], smsTemplates = [], notify, sendBookingCompletionLink, uploadAdminBookingDocument, createAdminPaymentLink }) {
  const pendingExtensions = extensionRequests.filter((request) => request.status === 'pending');
  const approvedUnpaidExtensions = extensionRequests.filter((request) => request.status === 'approved_pending_payment');
  const displayedRentals = focusRentalId ? rentals.filter((rental) => rental.id === focusRentalId) : rentals;

  return <>
    {!focusRentalId && <Panel title="Extension Requests" eyebrow="Return Changes">
      <div className="table-list">
        {pendingExtensions.length === 0 && <p className="muted">No pending extension requests.</p>}
        {pendingExtensions.map((request) => <div className="data-row" key={request.id}>
          <div>
            <strong>{request.rentals?.vehicles?.name || 'Vehicle'}</strong>
            <span>{request.rentals?.profiles?.full_name || 'Client'} • current return {formatRentalDate(request.rentals?.return_date, request.rentals?.return_time)}</span>
            <small>Requested return {formatRentalDate(request.requested_return_date, request.requested_return_time)}</small>
            {request.customer_note && <small>Customer note: {request.customer_note}</small>}
          </div>
          <div className="row-actions">
            <button className="approve" onClick={()=>decideExtension(request.id, true)}><CheckCircle2 size={15}/> Approve</button>
            <button className="reject" onClick={()=>decideExtension(request.id, false)}><XCircle size={15}/> Reject</button>
          </div>
        </div>)}
        {approvedUnpaidExtensions.map((request) => <div className="data-row" key={request.id}>
          <div>
            <strong>{request.rentals?.vehicles?.name || 'Vehicle'} extension approved</strong>
            <span>{request.rentals?.profiles?.full_name || 'Client'} • payment required before {formatRentalDate(request.requested_return_date, request.requested_return_time)} activates</span>
            <small>{money(request.extension_total_amount)} due for {request.extension_days || 1} extension day(s){request.request_kind === 'switch_car_continuation' ? ` • ${money(request.deposit_carried_amount || 0)} deposit carried${Number(request.deposit_increase_amount || 0) > 0 ? ` • collect ${money(request.deposit_increase_amount)} deposit difference` : ''}${Number(request.deposit_decrease_amount || 0) > 0 ? ` • refund ${money(request.deposit_decrease_amount)} after switch inspection` : ''}` : ' • existing deposit remains held'}</small>
          </div>
          <div className="row-actions">
            <button className="approve" onClick={()=>recordExtensionPayment(request.id)}><CreditCard size={15}/> Record Extension Payment</button>
            <button className="reject" onClick={()=>cancelApprovedExtension(request.id)}><XCircle size={15}/> Cancel Hold</button>
          </div>
        </div>)}
      </div>
    </Panel>}
    <Panel title="All Rentals" eyebrow="Reservations">
      {focusRentalId && <div className="manual-booking-focus-banner"><CheckCircle2 size={20}/><div><strong>Manual booking created</strong><span>Finish this customer’s required steps below. The payment controls unlock only after verification, approved documents, and agreement.</span></div><button type="button" className="secondary-btn" onClick={clearRentalFocus}>Show All Rentals</button></div>}
      {!focusRentalId && <>
      <div className="filter-pills" role="group" aria-label="Rental filters">
        {rentalFilterOptions().map((filter) => (
          <button type="button" key={filter.key} className={rentalFilter === filter.key ? 'active' : ''} onClick={() => setRentalFilter(filter.key)}>
            {filter.label}
          </button>
        ))}
      </div>
      <div className="search-row"><Search size={18}/><input value={search} maxLength="120" onChange={(e)=>setSearch(limitText(e.target.value, 120))} placeholder="Search customer, car, phone, status..." /></div>
      </>}
      {displayedRentals.length === 0 && <p className="muted">No rentals match this view.</p>}
      <div className="table-list">{displayedRentals.map((r) => <RentalRow key={r.id} rental={r} updateRentalStatus={updateRentalStatus} completeRentalReturn={completeRentalReturn} releaseSecurityDeposit={releaseSecurityDeposit} recordLocalDepositRelease={recordLocalDepositRelease} depositAllocations={depositAllocations.filter((item) => item.holder_rental_id === r.id)} recordTestPayment={recordTestPayment} recordExtensionPayment={recordExtensionPayment} cancelApprovedExtension={cancelApprovedExtension} extensionRequests={extensionRequests} emergencyExceptions={emergencyExceptions.filter((item) => item.rental_id === r.id)} emergencyAuthorized={emergencyAuthorized} activateRentalWithEmergencyException={activateRentalWithEmergencyException} resolveEmergencyExceptionScope={resolveEmergencyExceptionScope} vehicles={vehicles} reports={reports} decideExtension={decideExtension} sendManualReminder={sendManualReminder} detailed rentalDocuments={documentsByRentalId[r.id] || []} allDocuments={documents} openDocument={openDocument} markDocument={markDocument} deleteDocument={deleteDocument} rentalCharges={rentalCharges.filter((charge) => charge.rental_id === r.id)} addRentalCharge={addRentalCharge} waiveRentalCharge={waiveRentalCharge} chargeRentalSavedCard={chargeRentalSavedCard} emailTemplates={emailTemplates} smsTemplates={smsTemplates} notify={notify} sendBookingCompletionLink={sendBookingCompletionLink} uploadAdminBookingDocument={uploadAdminBookingDocument} createAdminPaymentLink={createAdminPaymentLink} />)}</div>
    </Panel>
  </>;
}

function Customers({ profiles, rentals, documentsByUserId, documents, reports, openDocument, emailTemplates, smsTemplates, notify }) {
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [contactCustomerId, setContactCustomerId] = useState('');
  const customerProfiles = profiles.filter((profile) => String(profile.role || 'customer').toLowerCase() !== 'admin');
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
        <span>{visibleCustomers.length} of {customerProfiles.length} customers</span>
      </div>
      <div className="table-list customer-summary-list">
        {visibleCustomers.length === 0 && <p className="muted list-empty-state">No customers match “{customerSearch.trim()}”.</p>}
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

function renderMessagePreview(value, profile, rental, charge) {
  const firstName = String(profile?.full_name || 'Customer').trim().split(/\s+/)[0];
  const variables = {
    customer_name: profile?.full_name || 'Customer', customer_first_name: firstName,
    vehicle_name: rental?.vehicles?.name || 'your rental vehicle',
    pickup_date: rental?.pickup_date ? formatRentalDate(rental.pickup_date, rental.pickup_time).split(' at ')[0] : 'your scheduled date',
    pickup_time: rental?.pickup_time || 'your scheduled time',
    return_date: rental?.return_date ? formatRentalDate(rental.return_date, rental.return_time).split(' at ')[0] : 'your scheduled date',
    return_time: rental?.return_time || 'your scheduled time',
    manage_booking_url: charge ? `${import.meta.env.VITE_CLIENT_PORTAL_URL || 'https://login.rentmect.com'}?billing=1` : import.meta.env.VITE_CLIENT_PORTAL_URL || 'https://login.rentmect.com',
    business_phone: import.meta.env.VITE_RENTMECT_PHONE || '860-558-6031',
    charge_name: charge?.name || 'additional rental charge',
    charge_description: charge?.description || 'Please contact Rent Me CT with any questions.',
    charge_total: money(charge?.total_amount || 0),
  };
  return String(value || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => variables[key] || '');
}

function CustomerContactModal({ profile, rentals, emailTemplates = [], smsTemplates = [], notify, initialTemplateKey = '', charge = null, onClose }) {
  const initialChannel = profile.phone && profile.phone_verified ? 'sms' : profile.email ? 'email' : 'sms';
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
  const canSendToDestination = channel === 'email' ? Boolean(profile.email) : Boolean(profile.phone && profile.phone_verified);

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
    if (!canSendToDestination) return setError(channel === 'email' ? 'Add an email address before sending.' : 'Add and verify a phone number before sending a text.');
    if (!selectedTemplate) return setError(`No enabled ${channel === 'email' ? 'email' : 'text'} templates are available.`);
    setSending(true);
    setError('');
    try {
      if (channel === 'email') {
        const { data: sessionData } = await supabase.auth.getSession();
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-emails/customer`, {
          method: 'POST',
          headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${sessionData.session?.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerId: profile.id, emailTemplateId: selectedTemplate.id, rentalId: rentalId || null, chargeId: charge?.id || null }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.error) throw new Error(payload.error || `Email request failed (${response.status}).`);
      } else {
        const { data, error: invokeError } = await supabase.functions.invoke('send-rental-due-reminders', {
          body: { customerId: profile.id, smsTemplateId: selectedTemplate.id, rentalId: rentalId || null, chargeId: charge?.id || null },
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
    ? renderMessagePreview(selectedTemplate?.text_body || selectedTemplate?.subject, profile, selectedRental, charge)
    : renderMessagePreview(selectedTemplate?.body, profile, selectedRental, charge);

  return <div className="admin-modal-backdrop customer-contact-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="admin-modal customer-contact-modal" role="dialog" aria-modal="true" aria-label={`Message ${profile.full_name || 'customer'}`} onSubmit={sendMessage}>
      <header className="admin-modal-header customer-contact-header">
        <span className="customer-contact-icon"><MessageCircle size={20}/></span>
        <div><small>Customer communication</small><strong>Send a message</strong><span>{profile.full_name || 'Unnamed Client'}{profile.email ? ` • ${profile.email}` : ''}</span></div>
        <button className="customer-details-close" type="button" onClick={onClose} aria-label="Close"><XCircle size={20}/></button>
      </header>
      <div className="customer-contact-body">
        <div className="contact-channel-toggle" role="group" aria-label="Message channel">
          <button type="button" className={channel === 'sms' ? 'active' : ''} onClick={() => chooseChannel('sms')}><MessageCircle size={16}/> Text</button>
          <button type="button" className={channel === 'email' ? 'active' : ''} onClick={() => chooseChannel('email')}><Mail size={16}/> Email</button>
        </div>
        <div className={`contact-destination ${canSendToDestination ? 'ready' : 'missing'}`}><span className="contact-status-dot"/><div><strong>{destination || `No ${channel === 'email' ? 'email address' : 'phone number'} saved`}</strong><span>{canSendToDestination ? `Ready to send by ${channel === 'email' ? 'SendGrid' : 'Twilio'}` : channel === 'sms' && profile.phone ? 'This number must be verified before texting.' : `Add a ${channel === 'email' ? 'customer email address' : 'verified customer phone number'} first.`}</span></div></div>
        <div className={`contact-field-grid ${sortedRentals.length ? '' : 'single'}`}>
          <label><span>Message template</span><select value={selectedTemplate?.id || ''} onChange={(event) => setTemplateId(event.target.value)} disabled={!templates.length}>{templates.length ? templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>) : <option value="">No templates available</option>}</select></label>
          {sortedRentals.length > 0 && <label><span>Related rental</span><select value={rentalId} onChange={(event) => setRentalId(event.target.value)}><option value="">No specific rental</option>{sortedRentals.map((rental) => <option value={rental.id} key={rental.id}>{rental.vehicles?.name || 'Vehicle'} • {formatRentalDate(rental.pickup_date, rental.pickup_time)}</option>)}</select></label>}
        </div>
        {channel === 'email' && selectedTemplate?.subject && <div className="contact-subject"><span>Subject</span><strong>{renderMessagePreview(selectedTemplate.subject, profile, selectedRental, charge)}</strong></div>}
        <div className="contact-preview"><div><span>{channel === 'email' ? 'Email' : 'Text'} preview</span><small>{preview.length} characters</small></div><p>{preview || 'Choose a template to preview the message.'}</p></div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <footer className="customer-contact-actions"><span>{canSendToDestination ? `Will send to ${destination}` : 'A valid destination is required.'}</span><div><button className="contact-cancel" type="button" onClick={onClose}>Cancel</button><button className="contact-send" disabled={sending || !selectedTemplate || !canSendToDestination}><Send size={15}/>{sending ? 'Sending…' : `Send ${channel === 'email' ? 'email' : 'text'}`}</button></div></footer>
    </form>
  </div>;
}

function CustomerDetailsModal({ profile, rentals, documents, reports, openDocument, onClose }) {
  const risk = customerRiskProfile(profile, rentals, documents, reports);
  const age = adminCustomerAge(profile.date_of_birth);
  const sortedRentals = [...rentals].sort((a, b) => new Date(b.created_at || b.pickup_date || 0) - new Date(a.created_at || a.pickup_date || 0));

  return <div className="admin-modal-backdrop customer-details-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className="admin-modal customer-details-modal" role="dialog" aria-modal="true" aria-label={`Customer details for ${profile.full_name || profile.email || 'customer'}`}>
      <header className="admin-modal-header">
        <UserRound size={22}/>
        <div><strong>{profile.full_name || 'Unnamed Client'}</strong><span>{profile.email || profile.id}</span></div>
        <button className="customer-details-close" type="button" onClick={onClose} aria-label="Close customer details"><XCircle size={20}/></button>
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
            <span className={profile.identity_verification_status === 'verified' ? 'verified' : 'warning'}><strong>Identity</strong>{prettyStatus(profile.identity_verification_status || 'unverified')}</span>
            <span className={profile.blocked_customer || profile.customer_status === 'blocked' ? 'danger' : 'verified'}><strong>Account</strong>{profile.blocked_customer || profile.customer_status === 'blocked' ? 'Blocked' : prettyStatus(profile.customer_status || 'good')}</span>
            <span className={age !== null && age < 25 ? 'warning' : 'verified'}><strong>Age</strong>{age === null ? 'Not confirmed' : `${age} years old`}</span>
          </div>
        </section>

        <section className="customer-details-section">
          <h3>Contact and profile</h3>
          <dl className="customer-detail-grid">
            <div><dt>Email</dt><dd>{profile.email || 'Not provided'}</dd></div>
            <div><dt>Phone</dt><dd>{profile.phone || 'Not provided'}</dd></div>
            <div><dt>Date of birth</dt><dd>{profile.date_of_birth ? new Date(`${profile.date_of_birth}T12:00:00`).toLocaleDateString() : 'Not provided'}</dd></div>
            <div><dt>Deposit tier</dt><dd>{age === null ? 'Age not confirmed' : age < 25 ? '$500 — under 25' : '$300 — age 25+'}</dd></div>
            <div className="wide"><dt>Home address</dt><dd>{profile.address || 'Not provided'}</dd></div>
            <div className="wide"><dt>Intended vehicle use</dt><dd>{profile.intended_vehicle_use || 'Not provided'}</dd></div>
            <div className="wide"><dt>Admin notes</dt><dd>{profile.admin_notes || 'No admin notes'}</dd></div>
          </dl>
        </section>

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
      <footer className="modal-actions customer-details-actions"><button className="primary-btn" type="button" onClick={onClose}>Done</button></footer>
    </section>
  </div>;
}

function AuditLog({ auditLogs = [] }) {
  const [query, setQuery] = useState('');
  const [entityFilter, setEntityFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const entities = [...new Set(auditLogs.map((log) => log.entity_type).filter(Boolean))].sort();
  const actions = [...new Set(auditLogs.map((log) => log.action).filter(Boolean))].sort();
  const normalizedQuery = query.trim().toLowerCase();
  const visibleLogs = auditLogs.filter((log) => {
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
  const [contactSearch, setContactSearch] = useState('');
  const [contactProfile, setContactProfile] = useState(null);
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
  const contactableProfiles = profiles
    .filter((profile) => profile.role !== 'admin' && (profile.email || profile.phone))
    .filter((profile) => {
      const query = contactSearch.trim().toLowerCase();
      if (!query) return true;
      return [profile.full_name, profile.email, profile.phone].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
    })
    .sort((a, b) => String(a.full_name || a.email || '').localeCompare(String(b.full_name || b.email || '')));

  async function loadEmailData(silent = false) {
    if (!silent) setLoadingEmails(true);
    const [templatesRes, textTemplatesRes, campaignsRes, outboxRes, eventsRes] = await Promise.all([
      supabase.from('email_templates').select('*').order('category').order('name'),
      supabase.from('sms_templates').select('*').order('category').order('name'),
      supabase.from('email_campaigns').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('email_outbox').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('email_delivery_events').select('*').order('event_at', { ascending: false }).limit(200),
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
    if (!composer.name.trim() || !composer.subject.trim() || !composer.htmlBody.trim()) return notify('Campaign name, subject, and body are required.');
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
      setSection('history');
      notify(schedule ? 'Campaign scheduled.' : 'Campaign started.', 'success');
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
      {[['inbox', 'Inbox'], ['contact', 'Contact Customer'], ['templates', 'Templates'], ['automated', 'Automations'], ['compose', 'Campaigns'], ['history', 'History']].map(([key, label]) => <button key={key} className={section === key ? 'active' : ''} onClick={() => setSection(key)}>{label}</button>)}
    </div>

    {section === 'inbox' && <CommunicationsInbox rentals={rentals} messages={messages} selectedRental={selectedRental} onSelectThread={onSelectThread} replyText={replyText} setReplyText={setReplyText} sendReply={sendReply} />}

    {section === 'contact' && <Panel title="Contact a Customer" eyebrow="One-to-One Email or Text">
      <div className="communications-contact-toolbar"><div className="search-row"><Search size={18}/><input value={contactSearch} maxLength="140" onChange={(event) => setContactSearch(limitText(event.target.value, 140))} placeholder="Search customer name, email, or phone…" /></div><span>{contactableProfiles.length} customers</span></div>
      <div className="communications-customer-list">
        {contactableProfiles.map((profile) => {
          const customerRentals = rentals.filter((rental) => rental.user_id === profile.id);
          return <article key={profile.id}><div className="communications-customer-avatar">{String(profile.full_name || profile.email || 'C').trim().charAt(0).toUpperCase()}</div><div><strong>{profile.full_name || 'Unnamed customer'}</strong><span>{[profile.email, profile.phone].filter(Boolean).join(' • ')}</span><small>{customerRentals.length} rental{customerRentals.length === 1 ? '' : 's'} • {profile.phone_verified ? 'phone verified' : 'phone not verified'}</small></div><button className="primary-btn" type="button" onClick={() => setContactProfile(profile)}><Send size={15}/> Contact</button></article>;
        })}
        {!contactableProfiles.length && <p className="muted">No customers match that search.</p>}
      </div>
    </Panel>}

    {section === 'automated' && <div className="email-card-grid">
      {automated.map((template) => <article className="email-setting-card" key={template.id}>
        <div><span className={`email-status-dot ${template.enabled ? 'enabled' : ''}`}/><div><strong>{template.name}</strong><small>Email • Trigger: {prettyStatus(template.trigger_key || 'manual')}</small></div></div>
        <p>{template.subject}</p>
        <div className="email-card-actions"><button className="secondary-btn" onClick={() => setEditingTemplate({ ...template })}><Pencil size={15}/> Edit</button><button className={template.enabled ? 'secondary-btn' : 'primary-btn'} onClick={() => toggleAutomation(template)}>{template.enabled ? 'Disable' : 'Enable'}</button></div>
      </article>)}
      {automatedTexts.map((template) => <article className="email-setting-card" key={template.id}>
        <div><span className={`email-status-dot ${template.enabled ? 'enabled' : ''}`}/><div><strong>{template.name}</strong><small>Text message • {prettyStatus(template.template_key)}</small></div></div>
        <p>{template.body}</p>
        <div className="email-card-actions"><button className="secondary-btn" onClick={() => setEditingTextTemplate({ ...template })}><Pencil size={15}/> Edit</button><button className={template.enabled ? 'secondary-btn' : 'primary-btn'} onClick={() => toggleTextAutomation(template)}>{template.enabled ? 'Disable' : 'Enable'}</button></div>
      </article>)}
      {!automated.length && !automatedTexts.length && <p className="muted">Run the communications migrations to install automated email and text templates.</p>}
    </div>}

    {section === 'templates' && <Panel title="Reusable Templates" eyebrow="Email & Text Library">
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

    {section === 'compose' && <div className="email-compose-layout">
      <Panel title="Create Custom Email" eyebrow="Broadcast">
        <div className="portal-form email-compose-form">
          <input placeholder="Campaign name (internal only)" value={composer.name} onChange={(event) => setComposer({ ...composer, name: limitText(event.target.value, 120) })}/>
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

    {section === 'history' && <div className="email-history-grid">
      <Panel title="Campaigns" eyebrow="Custom Emails"><div className="email-history-list">{campaigns.map((campaign) => <article key={campaign.id}><span className={`email-history-status ${campaign.status}`}>{prettyStatus(campaign.status)}</span><div><strong>{campaign.name}</strong><small>{campaign.subject}</small></div><em>{campaign.sent_count || 0}/{campaign.recipient_count || 0} sent</em></article>)}{!campaigns.length && <p className="muted">No custom campaigns yet.</p>}</div></Panel>
      <Panel title="Automated Queue" eyebrow="Transactional"><div className="email-history-list">{outbox.map((job) => <article key={job.id}><span className={`email-history-status ${job.status}`}>{prettyStatus(job.status)}</span><div><strong>{prettyStatus(job.email_type)}</strong><small>{job.recipient_email}</small></div><em>{job.sent_at ? new Date(job.sent_at).toLocaleString() : job.last_error || 'Queued'}</em></article>)}{!outbox.length && <p className="muted">No automated emails queued yet.</p>}</div></Panel>
      <Panel title="Recent Provider Events" eyebrow="SendGrid"><div className="email-history-list">{events.slice(0, 50).map((event) => <article key={event.id}><span className={`email-history-status ${event.event_type}`}>{prettyStatus(event.event_type)}</span><div><strong>{event.email || 'Recipient unavailable'}</strong><small>{event.provider_message_id || 'SendGrid event'}</small></div><em>{new Date(event.event_at).toLocaleString()}</em></article>)}{!events.length && <p className="muted">Delivery events will appear after the SendGrid webhook is connected.</p>}</div></Panel>
    </div>}

    {editingTemplate && <div className="admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingTemplate(null); }}>
      <form className="admin-modal email-template-modal" onSubmit={saveTemplate}>
        <div className="admin-modal-header"><Mail size={21}/><div><strong>{editingTemplate.id ? 'Edit Email Template' : 'Add Email Template'}</strong><span>Versioned content sent through Twilio SendGrid</span></div><button type="button" className="vehicle-editor-close" onClick={() => setEditingTemplate(null)}><X size={19}/></button></div>
        <div className="email-template-editor"><div className="portal-form"><input placeholder="Template name" value={editingTemplate.name} onChange={(event) => setEditingTemplate({ ...editingTemplate, name: limitText(event.target.value, 120) })}/><input placeholder="Subject" value={editingTemplate.subject} onChange={(event) => setEditingTemplate({ ...editingTemplate, subject: limitText(event.target.value, 200) })}/><input placeholder="Preview text" value={editingTemplate.preheader || ''} onChange={(event) => setEditingTemplate({ ...editingTemplate, preheader: limitText(event.target.value, 240) })}/><label className="field-label email-body-field">Email body<textarea value={editingTemplate.html_body} onChange={(event) => setEditingTemplate({ ...editingTemplate, html_body: limitText(event.target.value, 30000) })}/></label><label className="checkbox-pill"><input type="checkbox" checked={editingTemplate.enabled !== false} onChange={(event) => setEditingTemplate({ ...editingTemplate, enabled: event.target.checked })}/> Enabled</label><div className="email-send-actions"><input type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)}/><button type="button" className="secondary-btn" disabled={busy} onClick={() => sendTemplateTest()}><Send size={15}/> Send Test</button></div></div><iframe className="email-preview-frame" title="Template preview" sandbox="" srcDoc={editorPreview}/></div>
        <div className="modal-actions"><button type="button" className="secondary-btn" onClick={() => setEditingTemplate(null)}>Cancel</button><button className="approve" disabled={busy}><CheckCircle2 size={16}/> Save Template</button></div>
      </form>
    </div>}

    {editingTextTemplate && <div className="admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingTextTemplate(null); }}>
      <form className="admin-modal contact-text-template-modal" onSubmit={saveTextTemplate}>
        <div className="admin-modal-header"><MessageCircle size={21}/><div><strong>{editingTextTemplate.id ? 'Edit Text Template' : 'Add Text Template'}</strong><span>{prettyStatus(editingTextTemplate.category || 'manual')} customer SMS content</span></div><button type="button" className="vehicle-editor-close" onClick={() => setEditingTextTemplate(null)}><X size={19}/></button></div>
        <div className="portal-form contact-text-template-editor">
          <label><span>Template name</span><input required maxLength="120" value={editingTextTemplate.name || ''} onChange={(event) => setEditingTextTemplate({ ...editingTextTemplate, name: limitText(event.target.value, 120) })}/></label>
          <label className="full-field"><span>Text message</span><textarea required maxLength="1600" value={editingTextTemplate.body || ''} onChange={(event) => setEditingTextTemplate({ ...editingTextTemplate, body: limitText(event.target.value, 1600) })}/><small>{String(editingTextTemplate.body || '').length}/1600 characters. Longer messages may be delivered as multiple SMS segments.</small></label>
          <label className="checkbox-pill full-field"><input type="checkbox" checked={editingTextTemplate.enabled !== false} onChange={(event) => setEditingTextTemplate({ ...editingTextTemplate, enabled: event.target.checked })}/> Enabled for admin use</label>
          <div className="contact-variable-help full-field"><strong>Available variables</strong><span>{'{{customer_first_name}}'} · {'{{vehicle_name}}'} · {'{{pickup_date}}'} · {'{{pickup_time}}'} · {'{{return_date}}'} · {'{{return_time}}'} · {'{{manage_booking_url}}'} · {'{{business_phone}}'} · {'{{charge_name}}'} · {'{{charge_total}}'}</span></div>
        </div>
        <div className="modal-actions"><button type="button" className="secondary-btn" onClick={() => setEditingTextTemplate(null)}>Cancel</button><button className="approve" disabled={busy}><CheckCircle2 size={16}/> Save Text Template</button></div>
      </form>
    </div>}
    {contactProfile && <CustomerContactModal profile={contactProfile} rentals={rentals.filter((rental) => rental.user_id === contactProfile.id)} emailTemplates={manual.filter((template) => template.enabled)} smsTemplates={manualTexts.filter((template) => template.enabled)} notify={notify} onClose={() => setContactProfile(null)} />}
  </section>;
}

function emailAdminPreview(htmlBody, preheader = '') {
  const variables = { customer_first_name: 'Alex', customer_name: 'Alex Customer', booking_number: 'A1B2C3D4E5', vehicle_name: 'Ford F-350 4X4 #191', pickup_date: 'Jul 25, 2026', pickup_time: '9:00 AM', return_date: 'Jul 27, 2026', return_time: '9:00 AM', requested_return_date: 'Jul 28, 2026', requested_return_time: '6:00 PM', rental_total: '$200.00', service_fee_total: '$35.00', tax_amount: '$14.92', deposit_amount: '$300.00', total_paid: '$549.92', extension_total: '$106.35', charge_name: 'Connecticut toll', charge_description: 'Toll recorded during the rental.', charge_total: '$10.64', manage_booking_url: 'https://login.rentmect.com', business_address: '12 Holmes Circle, Farmington, CT' };
  const rendered = String(htmlBody || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => variables[key] || '');
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif"><div style="display:none">${preheader || ''}</div><table width="100%" cellpadding="0" cellspacing="0" style="padding:18px"><tr><td align="center"><table width="100%" style="max-width:620px;background:#fff;border:1px solid #ddd"><tr><td style="padding:20px 26px;background:#050505;color:#fff;font-size:22px;font-weight:800">RENT ME CT</td></tr><tr><td style="padding:28px;line-height:1.6">${rendered}<hr style="border:0;border-top:1px solid #ddd;margin-top:26px"><small>Rent Me CT · 12 Holmes Circle, Farmington, CT</small></td></tr></table></td></tr></table></body></html>`;
}

function Vehicles({ vehicles, vehicleForm, setVehicleForm, addVehicle, updateVehicleStatus, updateVehiclePublished, markVehicleServiced, editingVehicleId, editVehicleForm, setEditVehicleForm, startEditVehicle, cancelEditVehicle, saveVehicleEdit, deleteVehicle, availabilityTypes, notify }) {
  const [selectedVehicleId, setSelectedVehicleId] = useState(vehicles[0]?.id || '');
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [imageUploadBusy, setImageUploadBusy] = useState(false);
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
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
  const statusOptions = Object.entries(availabilityTypes).map(([key, type]) => [key, type.label]);
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
        const maintenance = getVehicleMaintenanceState(v);
        return <div className={`data-row vehicle-list-row ${isSelected ? 'selected' : ''}`} role="button" tabIndex={0} key={v.id} onClick={() => selectVehicle(v)} onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') selectVehicle(v);
        }}>
          {getAdminVehicleImage(v) && <img className="vehicle-list-thumbnail" src={getAdminVehicleImage(v)} alt="" loading="lazy" decoding="async" />}
          <div>
            <strong>{v.name}</strong>
            <span>{v.brand} {v.model} • {v.vehicle_type}</span>
            <small>Plate: {v.plate_number || 'TBD'} • VIN: {v.vin || 'TBD'} • Mileage: {formatMiles(v.current_mileage)}</small>
            <small className={`maintenance-summary ${maintenance.due ? 'due' : maintenance.soon ? 'soon' : ''}`}>
              <Wrench size={13}/> {maintenance.label}
            </small>
          </div>
          <div className="row-actions vehicle-row-actions">
            <div className="vehicle-row-price">
              <strong>{money(v.daily_rate)}<span>/day</span></strong>
              <small>{money(v.security_deposit)} deposit</small>
            </div>
            <div className="vehicle-row-state">
              <span className={`vehicle-publish-badge ${v.published === false ? 'unpublished' : 'published'}`}>{v.published === false ? 'Unpublished' : 'Published'}</span>
              <span className={`fleet-status-badge ${String(v.status || 'available').toLowerCase()}`}>{prettyVehicleStatus(v.status)}</span>
            </div>
            <div className="vehicle-row-controls">
              {SYSTEM_VEHICLE_STATUSES.includes(String(v.status || '').toLowerCase()) ? (
                <span className="system-owned-status">System controlled</span>
              ) : (
                <label className="vehicle-status-control"><span>Status</span><select value={v.status || 'available'} onClick={(event) => event.stopPropagation()} onChange={(e)=>updateVehicleStatus(v.id, e.target.value)}>{statusOptions.map(([key, label])=><option key={key} value={key}>{label}</option>)}</select></label>
              )}
              <button className="secondary-btn vehicle-edit-btn" type="button" onClick={(event) => {
                event.stopPropagation();
                openVehicleEditor(v);
              }}><Pencil size={15}/> Edit</button>
              <button className="secondary-btn vehicle-publish-btn" type="button" onClick={(event) => {
                event.stopPropagation();
                updateVehiclePublished(v.id, v.published === false);
              }}>{v.published === false ? 'Publish' : 'Unpublish'}</button>
              {(maintenance.due || maintenance.soon) && <button className="secondary-btn" type="button" onClick={(event) => {
                event.stopPropagation();
                markVehicleServiced(v);
              }}><Wrench size={15}/> Serviced</button>}
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
          <button className="vehicle-editor-close" type="button" onClick={closeAddVehicle} aria-label="Close add vehicle form"><X size={19}/></button>
        </div>
        <form className="portal-form vehicle-editor-scroll vehicle-detail-form" onSubmit={async (event) => {
          const created = await addVehicle(event);
          if (created) setAddVehicleOpen(false);
        }}>
        <section className="vehicle-form-card">
          <div className="vehicle-form-card-heading"><strong>Vehicle details</strong><span>Customer-facing identity and registration information.</span></div>
          <div className="vehicle-form-grid">
            <label className="field-label">Vehicle name<input placeholder="Audi Q5 #474" maxLength="80" value={vehicleForm.name} onChange={(e)=>update('name', e.target.value)} required /></label>
            <label className="field-label">Brand<input placeholder="Audi" maxLength="40" value={vehicleForm.brand} onChange={(e)=>update('brand', e.target.value)} /></label>
            <label className="field-label">Model<input placeholder="Q5" maxLength="40" value={vehicleForm.model} onChange={(e)=>update('model', e.target.value)} /></label>
            <label className="field-label">Vehicle type<input placeholder="SUV, luxury sedan, truck…" maxLength="40" value={vehicleForm.vehicle_type} onChange={(e)=>update('vehicle_type', e.target.value)} /></label>
            <label className="field-label">Plate number<input placeholder="Plate number" maxLength={PLATE_MAX_LENGTH} value={vehicleForm.plate_number} onChange={(e)=>update('plate_number', e.target.value)} title={`Plate number, ${PLATE_MAX_LENGTH} characters max`} /></label>
            <label className="field-label">VIN<input placeholder="17 characters" minLength={VIN_MAX_LENGTH} maxLength={VIN_MAX_LENGTH} pattern="[A-HJ-NPR-Z0-9]{17}" title="VIN must be 17 characters. Letters I, O, and Q are not used in VINs." value={vehicleForm.vin} onChange={(e)=>update('vin', e.target.value)} /></label>
          </div>
        </section>
        <section className="vehicle-form-card">
          <div className="vehicle-form-card-heading"><strong>Pricing & operations</strong><span>Rental pricing, availability, mileage, and maintenance.</span></div>
          <div className="vehicle-form-grid">
            <label className="field-label">Daily rate<input type="number" step="0.01" min="0" max={MONEY_MAX} inputMode="decimal" placeholder="$0.00" title="Daily rate in USD" value={vehicleForm.daily_rate} onChange={(e)=>update('daily_rate', e.target.value)} /></label>
            <label className="field-label">Refundable deposit<input type="number" step="0.01" min="0" max={MONEY_MAX} inputMode="decimal" placeholder="$300.00" title="Base refundable deposit for this vehicle" value={vehicleForm.security_deposit} onChange={(e)=>update('security_deposit', e.target.value)} required /></label>
            <label className="field-label">Original odometer mileage
          <input type="number" min="0" max={MILEAGE_MAX} step="1" inputMode="numeric" value={vehicleForm.original_mileage} onChange={(e)=>update('original_mileage', e.target.value)} required />
            </label>
            <label className="field-label">Maintenance interval
          <select value={vehicleForm.maintenance_interval_miles} onChange={(e)=>update('maintenance_interval_miles', e.target.value)}>
            <option value="3000">Every 3,000 miles</option>
            <option value="5000">Every 5,000 miles</option>
            <option value="7500">Every 7,500 miles</option>
            <option value="10000">Every 10,000 miles</option>
          </select>
            </label>
            <label className="field-label">Last service mileage <span className="field-optional">Optional</span>
          <input type="number" min="0" max={MILEAGE_MAX} step="1" inputMode="numeric" value={vehicleForm.last_maintenance_mileage} onChange={(e)=>update('last_maintenance_mileage', e.target.value)} placeholder="Defaults to original mileage" />
            </label>
            <label className="field-label">Initial status<select value={vehicleForm.status} onChange={(e)=>update('status', e.target.value)}>{statusOptions.map(([key, label])=><option key={key} value={key}>{label}</option>)}</select></label>
            <label className="vehicle-publish-control">
          <input type="checkbox" checked={vehicleForm.published} onChange={(event)=>update('published', event.target.checked)} />
          <span><strong>Publish immediately</strong><small>Published vehicles appear in customer-facing fleet views. Leave this off to save a draft.</small></span>
            </label>
          </div>
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
          <button className="vehicle-editor-close" type="button" onClick={cancelEditVehicle} aria-label="Close vehicle editor"><X size={19}/></button>
        </div>
        <div className="vehicle-editor-scroll">
          <section className="vehicle-editor-media">
            <div className="vehicle-editor-section-heading">
              <div><strong>Vehicle pictures</strong><span>The first picture is used as the featured image.</span></div>
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
            <input placeholder="Vehicle name" maxLength="80" value={editVehicleForm.name} onChange={(e)=>updateEdit('name', e.target.value)} required />
            <input placeholder="Brand" maxLength="40" value={editVehicleForm.brand} onChange={(e)=>updateEdit('brand', e.target.value)} />
            <input placeholder="Model" maxLength="40" value={editVehicleForm.model} onChange={(e)=>updateEdit('model', e.target.value)} />
            <input placeholder="Type e.g. SUV, Luxury Sedan" maxLength="40" value={editVehicleForm.vehicle_type} onChange={(e)=>updateEdit('vehicle_type', e.target.value)} />
            <input placeholder="Plate Number" maxLength={PLATE_MAX_LENGTH} value={editVehicleForm.plate_number} onChange={(e)=>updateEdit('plate_number', e.target.value)} title={`Plate number, ${PLATE_MAX_LENGTH} characters max`} />
            <input placeholder="VIN - 17 characters" minLength={VIN_MAX_LENGTH} maxLength={VIN_MAX_LENGTH} pattern="[A-HJ-NPR-Z0-9]{17}" title="VIN must be 17 characters. Letters I, O, and Q are not used in VINs." value={editVehicleForm.vin} onChange={(e)=>updateEdit('vin', e.target.value)} />
            <input type="number" step="0.01" min="0" max={MONEY_MAX} inputMode="decimal" placeholder="$0.00 / day" title="Daily rate in USD" value={editVehicleForm.daily_rate} onChange={(e)=>updateEdit('daily_rate', e.target.value)} />
            <input type="number" step="0.01" min="0" max={MONEY_MAX} inputMode="decimal" placeholder="Refundable deposit" title="Base refundable deposit for this vehicle" value={editVehicleForm.security_deposit} onChange={(e)=>updateEdit('security_deposit', e.target.value)} required />
            <label className="field-label">Original odometer mileage
              <input type="number" min="0" max={MILEAGE_MAX} step="1" inputMode="numeric" value={editVehicleForm.original_mileage} onChange={(e)=>updateEdit('original_mileage', e.target.value)} required />
            </label>
            <label className="field-label">Current odometer mileage
              <input type="number" min={editVehicleForm.original_mileage || 0} max={MILEAGE_MAX} step="1" inputMode="numeric" value={editVehicleForm.current_mileage} onChange={(e)=>updateEdit('current_mileage', e.target.value)} required />
            </label>
            <label className="field-label">Maintenance interval
              <select value={editVehicleForm.maintenance_interval_miles} onChange={(e)=>updateEdit('maintenance_interval_miles', e.target.value)}>
                <option value="3000">Every 3,000 miles</option>
                <option value="5000">Every 5,000 miles</option>
                <option value="7500">Every 7,500 miles</option>
                <option value="10000">Every 10,000 miles</option>
              </select>
            </label>
            <label className="field-label">Last service mileage
              <input type="number" min="0" max={MILEAGE_MAX} step="1" inputMode="numeric" value={editVehicleForm.last_maintenance_mileage} onChange={(e)=>updateEdit('last_maintenance_mileage', e.target.value)} />
            </label>
            <select value={editVehicleForm.status} onChange={(e)=>updateEdit('status', e.target.value)}>
              <option value="">Keep system status ({prettyVehicleStatus(editingVehicle.status)})</option>
              {statusOptions.map(([key, label])=><option key={key} value={key}>{label}</option>)}
            </select>
            <label className="vehicle-publish-control">
              <input type="checkbox" checked={editVehicleForm.published} onChange={(event)=>updateEdit('published', event.target.checked)} />
              <span><strong>Published</strong><small>Turn this off to remove the vehicle from customer-facing fleet views.</small></span>
            </label>
            <textarea placeholder="Description for inventory notes or customer-facing details" maxLength="600" value={editVehicleForm.description} onChange={(e)=>updateEdit('description', e.target.value)} />
            <VehicleFeatureChecklist value={editVehicleForm.features} onChange={(value)=>updateEdit('features', value)} />
          </div>
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
        <button type="button" className="remove-photo" onClick={() => removePicture(index)}><Trash2 size={14}/> Remove</button>
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
          <strong>{docLabel(d.document_type)}</strong>
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

function ManualBooking({ manualBookingForm, setManualBookingForm, profiles, vehicles, rentals, pendingBookings = [], availabilityBlocks, under25Pricing, serviceFees = [], createManualBooking, submitting }) {
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const update = (key, value) => setManualBookingForm((current) => ({ ...current, [key]: value }));
  const updateSchedule = (key, value) => setManualBookingForm((current) => ({ ...current, [key]: value, vehicleId: '' }));
  const chooseCustomerMode = (customerMode) => {
    setCustomerSearch('');
    setCustomerDropdownOpen(false);
    setManualBookingForm((current) => ({
      ...current,
      customerMode,
      customerId: '',
      existingDateOfBirth: '',
      existingPhone: '',
      driverLicenseNumber: '',
      driverLicenseState: '',
      insuranceProvider: '',
      insurancePolicyNumber: '',
    }));
  };
  const customers = profiles
    .filter((profile) => profile.role !== 'admin')
    .sort((a, b) => String(a.full_name || a.email || '').localeCompare(String(b.full_name || b.email || '')));
  const normalizedCustomerSearch = customerSearch.trim().toLowerCase();
  const customerSearchDigits = normalizedCustomerSearch.replace(/\D/g, '');
  const matchingCustomers = customers.filter((profile) => {
    if (!normalizedCustomerSearch) return true;
    const name = String(profile.full_name || '').toLowerCase();
    const email = String(profile.email || '').toLowerCase();
    const phone = String(profile.phone || '');
    return name.includes(normalizedCustomerSearch) || email.includes(normalizedCustomerSearch) || (customerSearchDigits && phone.replace(/\D/g, '').includes(customerSearchDigits));
  }).slice(0, 12);
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === manualBookingForm.vehicleId);
  const selectedCustomer = profiles.find((profile) => profile.id === manualBookingForm.customerId);
  const days = Math.max(0, getRentalDays(manualBookingForm.pickupDate, manualBookingForm.returnDate));
  const reservationWindowReady = days >= 1;
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
    ? manualBookingForm.fullName.trim() || 'New customer'
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
          <label htmlFor="manual-customer-search"><span>Customer</span></label>
          <div className="customer-search-input">
            <Search size={18}/>
            <input id="manual-customer-search" value={customerSearch} onFocus={() => setCustomerDropdownOpen(true)} onBlur={() => window.setTimeout(() => setCustomerDropdownOpen(false), 120)} onChange={(event) => {
              setCustomerSearch(limitText(event.target.value, 160));
              setCustomerDropdownOpen(true);
              setManualBookingForm((current) => ({ ...current, customerId: '', existingDateOfBirth: '', existingPhone: '', driverLicenseNumber: '', driverLicenseState: '', insuranceProvider: '', insurancePolicyNumber: '' }));
            }} placeholder="Search name, email, or phone" autoComplete="off" role="combobox" aria-expanded={customerDropdownOpen} aria-controls="manual-customer-results" />
          </div>
          {customerDropdownOpen && <div className="customer-search-results" id="manual-customer-results" role="listbox">
            {matchingCustomers.length ? matchingCustomers.map((customer) => <button type="button" role="option" aria-selected={customer.id === manualBookingForm.customerId} key={customer.id} onMouseDown={(event) => event.preventDefault()} onClick={() => {
              setCustomerSearch(customer.full_name || customer.email || customer.phone || 'Customer');
              setCustomerDropdownOpen(false);
            setManualBookingForm((current) => ({
              ...current,
              customerId: customer.id,
              existingDateOfBirth: customer?.date_of_birth || '',
              existingPhone: customer?.phone || '',
              driverLicenseNumber: customer?.drivers_license_number || '',
              driverLicenseState: customer?.drivers_license_state || '',
              insuranceProvider: customer?.insurance_provider || '',
              insurancePolicyNumber: customer?.insurance_policy_number || '',
            }));
            }}><strong>{customer.full_name || 'Unnamed customer'}</strong><span>{[customer.email, customer.phone].filter(Boolean).join(' • ') || 'No email or phone saved'}</span></button>) : <p>No customers match that search.</p>}
          </div>}
          {selectedCustomer && <div className="selected-customer-confirmation"><CheckCircle2 size={17}/><span><strong>Selected:</strong> {selectedCustomer.full_name || selectedCustomer.email || selectedCustomer.phone}<small>{selectedCustomer.email || 'Email missing'} • {selectedCustomer.phone || 'Phone missing'} • {selectedCustomer.phone_verified ? 'Phone verified' : 'Phone verification needed'} • {String(selectedCustomer.identity_verification_status || '').toLowerCase() === 'verified' ? 'Identity verified' : 'Identity verification needed'}</small></span></div>}
          {selectedCustomer && <label className="full-field"><span>Mobile number for secure texts</span><input type="tel" value={manualBookingForm.existingPhone} onChange={(event) => update('existingPhone', limitText(event.target.value, 32))} autoComplete="tel" placeholder="(860) 555-0123" /><small>{isValidUSPhone(manualBookingForm.existingPhone) ? 'Ready for SMS delivery. The customer must still verify this number personally.' : 'Enter 10 US digits to send the secure booking link by text.'}</small></label>}
        </div> : <div className="new-customer-fields">
          <label><span>Full name</span><input value={manualBookingForm.fullName} onChange={(event) => update('fullName', limitText(event.target.value, 120))} autoComplete="name" placeholder="Customer name" required /></label>
          <label><span>Email</span><input type="email" value={manualBookingForm.email} onChange={(event) => update('email', limitText(event.target.value, 200))} autoComplete="email" placeholder="customer@email.com" required /></label>
          <label><span>Phone</span><input type="tel" value={manualBookingForm.phone} onChange={(event) => update('phone', limitText(event.target.value, 32))} autoComplete="tel" placeholder="(860) 555-0123" required /></label>
          <label><span>Date of birth</span><input type="date" max={new Date().toISOString().slice(0, 10)} value={manualBookingForm.dateOfBirth} onChange={(event) => update('dateOfBirth', event.target.value)} required /></label>
          <label className="full-field"><span>Address (optional)</span><input value={manualBookingForm.address} onChange={(event) => update('address', limitText(event.target.value, 240))} autoComplete="street-address" placeholder="Street, city, state, ZIP" /></label>
          <p className="customer-save-note full-field"><ShieldCheck size={16}/> The customer will be saved and can use Forgot Password to access the client portal.</p>
        </div>}
        {manualBookingForm.customerMode === 'existing' && selectedCustomer && !selectedCustomer.date_of_birth && <label className="full-field missing-dob-field"><span>Date of birth required for deposit</span><input type="date" max={new Date().toISOString().slice(0, 10)} value={manualBookingForm.existingDateOfBirth} onChange={(event) => update('existingDateOfBirth', event.target.value)} required /></label>}

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
        <label><span>Pickup date</span><input type="date" value={manualBookingForm.pickupDate} onChange={(event) => updateSchedule('pickupDate', event.target.value)} required /></label>
        <label><span>Pickup time</span><select value={manualBookingForm.pickupTime} onChange={(event) => updateSchedule('pickupTime', event.target.value)}>{calendarTimeOptions(manualBookingForm.pickupTime).map((time) => <option key={time} value={time}>{time}</option>)}</select></label>
        <label><span>Return date</span><input type="date" min={manualBookingForm.pickupDate || undefined} value={manualBookingForm.returnDate} onChange={(event) => updateSchedule('returnDate', event.target.value)} required /></label>
        <label><span>Return time</span><select value={manualBookingForm.returnTime} onChange={(event) => updateSchedule('returnTime', event.target.value)}>{calendarTimeOptions(manualBookingForm.returnTime).map((time) => <option key={time} value={time}>{time}</option>)}</select></label>
        <label className="full-field vehicle-availability-field"><span>Vehicle availability</span><select value={manualBookingForm.vehicleId} onChange={(event) => update('vehicleId', event.target.value)} disabled={!reservationWindowReady} required><option value="">{reservationWindowReady ? 'Choose an available vehicle' : 'Choose pickup and return dates first'}</option>{vehicleChoices.map(({ vehicle, availability }) => <option key={vehicle.id} value={vehicle.id} disabled={!availability.available}>{availability.available ? '✓ Available' : '✕ Unavailable'} — {vehicle.name} — {money(vehicle.daily_rate)}/day{!availability.available ? ` — ${availability.reason}` : ''}</option>)}</select></label>
        <div className="booking-divider"><span>4. Next steps &amp; payment plan</span></div>
        <label className="full-field"><span>Send the customer’s secure completion link</span><select value={manualBookingForm.onboardingDelivery} onChange={(event) => update('onboardingDelivery', event.target.value)}><option value="both">Email + text now (recommended)</option><option value="text">Text only</option><option value="email">Email only</option><option value="none">Do not send yet — I will send it later</option></select></label>
        <label className="full-field"><span>How will payment be collected?</span><select value={manualBookingForm.paymentCollectionPreference} onChange={(event) => update('paymentCollectionPreference', event.target.value)}><option value="customer_link">Customer pays through the secure link (recommended)</option><option value="admin_stripe">Admin opens Stripe Checkout on this device</option><option value="external">Admin records payment received outside Stripe</option><option value="later">Decide later</option></select></label>
        {manualBookingForm.paymentCollectionPreference === 'admin_stripe' && <p className="payment-plan-note full-field"><CreditCard size={17}/><span>After the customer finishes verification, approved uploads, and signing, the procedure console will unlock <strong>Open Stripe Checkout on this device</strong>. Card details stay in Stripe and are never entered into this portal.</span></p>}
        {manualBookingForm.paymentCollectionPreference === 'external' && <p className="payment-plan-note full-field"><DollarSign size={17}/><span>After every prerequisite passes, use <strong>Record External Payment</strong> only after cash, card-terminal, bank, or other outside payment has actually cleared.</span></p>}
        <p className="customer-save-note full-field"><ShieldCheck size={17}/> The customer must personally verify phone and identity and sign the agreement. You can upload documents they provide and start Stripe payment after every prerequisite passes.</p>
        {reservationWindowReady && <div className="vehicle-availability-legend full-field"><span className="available"><CheckCircle2 size={16}/> Available for these exact times</span><span className="unavailable"><XCircle size={16}/> Unavailable vehicles are blocked</span></div>}
        {selectedVehicleAvailability && !selectedVehicleAvailability.available && <div className="vehicle-selection-warning full-field"><AlertTriangle size={17}/>{selectedVehicleAvailability.reason}</div>}
        <button className="primary-btn full-field" disabled={submitting || !selectedVehicle || !selectedVehicleAvailability?.available}><CalendarClock size={17}/> {submitting ? 'Creating booking…' : manualBookingForm.onboardingDelivery === 'none' ? 'Create Booking' : 'Create Booking & Send Next Steps'}</button>
      </form>
    </Panel>

    <div className="manual-booking-sidebar">
      <aside className="booking-summary-card">
        <p className="eyebrow">Booking Summary</p>
        <h3>{customerName}</h3>
        <dl>
          <div><dt>Vehicle</dt><dd>{selectedVehicle?.name || 'Not selected'}</dd></div>
          <div><dt>Dates</dt><dd>{days > 0 ? `${days} day${days === 1 ? '' : 's'}` : 'Choose dates'}</dd></div>
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
  availabilityTypes,
  updateAvailabilityType,
}) {
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
    <div className="under25-settings-panel">
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
    </div>

    <div className="promotion-settings-panel">
      <Panel title="Website Promotion Manager" eyebrow="Advertising">
        <p className="muted promotion-manager-intro">Create one campaign, write the popup and banner messages, choose where each appears, and schedule when both automatically disappear. The coupon buttons keep the same tap-to-copy action used on the current website.</p>
        <form className="portal-form settings-form promotion-form" onSubmit={saveSitePromotion}>
          <div className="promotion-form-section">
            <h4>Campaign and coupon</h4>
            <div className="form-row">
              <label><span>Campaign name (admin only)</span><input required maxLength="80" placeholder="Labor Day Special" value={promotionForm.name} onChange={(event) => updatePromotion('name', limitText(event.target.value, 80))} /></label>
              <label><span>Coupon code</span><input required list="promotion-discount-codes" maxLength="32" placeholder="LABORDAY20" value={promotionForm.coupon_code} onChange={(event) => updatePromotion('coupon_code', normalizeCodeInput(event.target.value))} /></label>
              <datalist id="promotion-discount-codes">{discountCodes.map((code) => <option value={code.code} key={code.id}>{discountLabel(code)}</option>)}</datalist>
            </div>
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
              <label><span>Button destination</span><input maxLength="300" placeholder="cars.html" value={promotionForm.cta_url} onChange={(event) => updatePromotion('cta_url', limitText(event.target.value, 300))} /></label>
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
    </div>

    <Panel title="Discount Codes" eyebrow="Pricing">
      <form className="portal-form settings-form" onSubmit={createDiscountCode}>
        <div className="form-row">
          <input placeholder="Code e.g. SUMMER25" maxLength="24" pattern="[A-Z0-9-]{3,24}" title="Discount code: 3-24 characters, uppercase letters, numbers, and hyphens only." value={discountForm.code} onChange={(event) => updateDiscount('code', event.target.value)} />
          <button type="button" className="secondary-btn" onClick={generateDiscountCode}><Tag size={16}/> Generate</button>
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
            <span>{discountLabel(code)} • {code.max_redemptions ? `${code.redemption_count || 0}/${code.max_redemptions} used` : `${code.redemption_count || 0} used`}</span>
            <small>{code.starts_at ? `Starts ${formatDateOnly(code.starts_at)}` : 'Starts now'} • {code.expires_at ? `Expires ${formatDateOnly(code.expires_at)}` : 'No expiration'}</small>
          </div>
          <div className="row-actions">
            <em className={code.active ? 'active-status' : 'paused-status'}>{code.active ? 'Active' : 'Paused'}</em>
            <button onClick={() => toggleDiscountCode(code.id, !code.active)}>{code.active ? 'Pause' : 'Activate'}</button>
            <button className="reject" onClick={() => deleteDiscountCode(code.id)}><XCircle size={16}/> Delete</button>
          </div>
        </div>)}
      </div>
    </Panel>

    <Panel title="Calendar Labels" eyebrow="Availability Colors">
      <div className="identifier-settings">
        {Object.entries(availabilityTypes).map(([key, type]) => (
          <div className="identifier-row" key={key}>
            <span className="identifier-swatch" style={{ backgroundColor: type.color }} />
            <div>
              <strong>{prettyStatus(key)}</strong>
              <small>Used by the fleet calendar paint brush and vehicle status dropdown.</small>
            </div>
            <input value={type.label} maxLength="28" onChange={(event) => updateAvailabilityType(key, 'label', limitText(event.target.value, 28))} aria-label={`${key} label`} title="Calendar label, 28 characters max." />
            <input type="color" value={type.color} onChange={(event) => updateAvailabilityType(key, 'color', event.target.value)} aria-label={`${key} color`} />
          </div>
        ))}
      </div>
    </Panel>

    <Panel title="Custom Fees" eyebrow="Pricing">
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
    </Panel>
  </section>;
}

function ReturnMonitorRow({ rental, sendManualReminder }) {
  const today = isToday(rental.return_date);
  const overdue = isOverdue(rental.return_date, rental.status);

  return <div className={`data-row return-monitor-row ${today ? 'due-today' : ''} ${overdue ? 'overdue' : ''}`}>
    <div>
      <strong>{rental.profiles?.full_name || rental.user_email || 'Client'}</strong>
      <span>{rental.vehicles?.name || 'Vehicle'}</span>
      <small>Return {formatRentalDate(rental.return_date, rental.return_time)}</small>
    </div>
    <div className="row-actions">
      {today && <em className="due-pill">Due Today</em>}
      {overdue && <em className="overdue-pill">Overdue</em>}
      <em>{prettyStatus(rental.status)}</em>
      <ReminderMenu rental={rental} sendManualReminder={sendManualReminder} />
    </div>
  </div>;
}

function RentalRow({ rental, updateRentalStatus, completeRentalReturn, releaseSecurityDeposit, recordLocalDepositRelease, depositAllocations = [], recordTestPayment, recordExtensionPayment, cancelApprovedExtension, extensionRequests = [], emergencyExceptions = [], emergencyAuthorized, activateRentalWithEmergencyException, resolveEmergencyExceptionScope, vehicles = [], reports = [], decideExtension, sendManualReminder, detailed, rentalDocuments = [], allDocuments = [], openDocument, markDocument, deleteDocument, rentalCharges = [], addRentalCharge, waiveRentalCharge, chargeRentalSavedCard, emailTemplates = [], smsTemplates = [], notify, sendBookingCompletionLink, uploadAdminBookingDocument, createAdminPaymentLink }) {
  const [returnPanelOpen, setReturnPanelOpen] = useState(false);
  const [pickupModal, setPickupModal] = useState(null);
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [contactModal, setContactModal] = useState(null);
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
  const canCompleteReturn = Boolean(completeRentalReturn) && rental.status === 'return_initiated';
  const releaseChecklist = getReleaseChecklist(rental, documentsForProgress);
  const activeEmergencyException = emergencyExceptions.find((item) => item.status === 'active');
  const canRecordExternalPayment = releaseChecklist.phone && releaseChecklist.identity && releaseChecklist.agreement && releaseChecklist.license && releaseChecklist.insurance;
  const canMarkActive = releaseChecklist.ready && !['active', 'overdue', 'return_initiated', 'completed', 'cancelled'].includes(rental.status);
  const canCancel = ['pending', 'documents_needed', 'document_review', 'ready_for_pickup', 'approved'].includes(rental.status);
  const canCreateEmergencyException = Boolean(emergencyAuthorized)
    && !activeEmergencyException
    && !releaseChecklist.ready
    && ['pending', 'documents_needed', 'document_review', 'approved', 'ready_for_pickup'].includes(rental.status);
  const progressSteps = getRentalProgressSteps(rental, documentsForProgress);
  const rentalExtensions = extensionRequests.filter((request) => request.rental_id === rental.id || request.rentals?.id === rental.id);
  const rentalReports = reports.filter((report) => report.rental_id === rental.id || report.rentals?.id === rental.id);
  const adminState = getAdminRentalState(rental, releaseChecklist);
  const defaultPickupMileage = rental?.starting_mileage ?? rental?.vehicles?.current_mileage ?? '';
  const canReleaseDeposit = Boolean(releaseSecurityDeposit)
    && rental.status === 'completed'
    && ['held', 'adjustment_refund_due'].includes(rental.deposit_status)
    && Number(rental.deposit_held_amount || rental.security_deposit || 0) > 0;
  const hasStripeDepositAllocation = depositAllocations.some((item) =>
    item.payment_provider === 'stripe' && ['held', 'refund_due_inspection', 'failed'].includes(item.status)
  ) || (depositAllocations.length === 0 && rental.payment_provider === 'stripe');
  const hasLocalDepositAllocation = depositAllocations.some((item) =>
    item.payment_provider === 'local' && ['held', 'refund_due_inspection', 'failed'].includes(item.status)
  ) || (depositAllocations.length === 0 && rental.payment_provider === 'local');

  function submitPickupOverride(startingMileage) {
    updateRentalStatus(rental.id, 'active', {
      startingMileage,
    });
    setPickupModal(null);
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
      {detailed && Number(rental.under_25_markup_amount || 0) > 0 && <small>Under-25 pricing: {money(rental.base_rental_total)} base + {money(rental.under_25_markup_amount)} ({Number(rental.under_25_markup_percentage || 0)}%) markup • {money(rental.base_security_deposit)} vehicle deposit adjusted to {money(rental.security_deposit)}</small>}
      {detailed && <small>Intended use: {rental.profiles?.intended_vehicle_use || 'Not provided'}</small>}
      {detailed && <DepositReleaseStatus rental={rental} />}
      {detailed && <MileageSummary rental={rental} />}
      {activeEmergencyException && <EmergencyExceptionBanner exception={activeEmergencyException} checklist={releaseChecklist} onResolve={(scope) => resolveEmergencyExceptionScope?.(activeEmergencyException.id, scope)} />}
      <RentalProgressTracker steps={progressSteps} />
      {detailed && <div className="rental-doc-summary">
        <DocumentStatusBadge label="License" document={license} />
        <DocumentStatusBadge label="Insurance" document={insurance} />
      </div>}
      {detailed && <DocumentMiniList documents={documentsForDisplay} openDocument={openDocument} markDocument={markDocument} deleteDocument={deleteDocument} />}
      {detailed && !['active', 'overdue', 'return_initiated', 'completed', 'cancelled'].includes(rental.status) && !rental.customer_auth_deleted_at && <AdminBookingProcedure
        rental={rental}
        checklist={releaseChecklist}
        documents={documentsForProgress}
        sendBookingCompletionLink={sendBookingCompletionLink}
        uploadAdminBookingDocument={uploadAdminBookingDocument}
        createAdminPaymentLink={createAdminPaymentLink}
        recordExternalPayment={recordTestPayment}
      />}
      {detailed && <RentalExtensionActions requests={rentalExtensions} vehicles={vehicles} decideExtension={decideExtension} recordExtensionPayment={recordExtensionPayment} cancelApprovedExtension={cancelApprovedExtension} />}
      {detailed && <RentalChargeManager rental={rental} charges={rentalCharges} addRentalCharge={addRentalCharge} waiveRentalCharge={waiveRentalCharge} chargeRentalSavedCard={chargeRentalSavedCard} sendPaymentLink={(charge) => setContactModal({ charge })} />}
      {detailed && rentalReports.length > 0 && <DamageReportList reports={rentalReports} />}
      {!canMarkActive && !canCompleteReturn && <small className="next-action-hint">{adminState.next}</small>}
      {returnPanelOpen && <ReturnCompletionPanel rental={rental} onCancel={() => setReturnPanelOpen(false)} onComplete={(inspection) => completeRentalReturn(rental, inspection)} />}
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
      {cancelModalOpen && <CancelRentalModal
        rental={rental}
        onCancel={() => setCancelModalOpen(false)}
        onConfirm={(reason) => {
          updateRentalStatus(rental.id, 'cancelled', { reason });
          setCancelModalOpen(false);
        }}
      />}
      {contactModal && <CustomerContactModal profile={rental.profiles || { id: rental.user_id, email: rental.user_email }} rentals={[rental]} emailTemplates={emailTemplates} smsTemplates={smsTemplates} notify={notify} initialTemplateKey={contactModal.charge ? 'manual_additional_charge_due' : ''} charge={contactModal.charge || null} onClose={() => setContactModal(null)} />}
    </div>
    <div className="row-actions rental-actions">
      <div className="rental-actions-primary">
        <span className={`workflow-badge ${adminState.tone}`}>{adminState.label}</span>
        {recordTestPayment && rental.payment_status !== 'paid' && canRecordExternalPayment && <button className="approve" onClick={()=>recordTestPayment(rental)}><CreditCard size={15}/> Record External Payment</button>}
        {canMarkActive && <button className="approve primary-action" onClick={()=>setPickupModal({})}><Car size={15}/> Mark Vehicle Picked Up</button>}
        {canCreateEmergencyException && <button className="emergency-exception-action" onClick={() => setEmergencyModalOpen(true)}><AlertTriangle size={15}/> Emergency Exception</button>}
        {canCompleteReturn && <button className="approve primary-action" onClick={()=>setReturnPanelOpen(true)}><CheckCircle2 size={15}/> Confirm Return Complete</button>}
        {canReleaseDeposit && hasStripeDepositAllocation && <button className="approve" onClick={() => releaseSecurityDeposit(rental)}><DollarSign size={15}/> {rental.deposit_status === 'adjustment_refund_due' ? 'Refund Deposit Decrease' : 'Refund Stripe Deposit'}</button>}
        {canReleaseDeposit && hasLocalDepositAllocation && <button className="approve" onClick={() => recordLocalDepositRelease(rental)}><DollarSign size={15}/> Record External Deposit Returned</button>}
      </div>
      <div className="rental-actions-secondary">
        {rental.agreement_snapshot && <button onClick={() => downloadAgreement(rental)}><FileSignature size={15}/> Agreement</button>}
        {canCancel && <button className="reject" onClick={()=>setCancelModalOpen(true)}><XCircle size={15}/> Cancel</button>}
        {detailed
          ? <button type="button" onClick={() => setContactModal({ charge: null })}><MessageCircle size={15}/> Contact Customer</button>
          : <ReminderMenu rental={rental} sendManualReminder={sendManualReminder} />}
      </div>
    </div>
  </div>;
}

function AdminBookingProcedure({ rental, checklist, sendBookingCompletionLink, uploadAdminBookingDocument, createAdminPaymentLink, recordExternalPayment }) {
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
      {steps.map(([label, complete, detail]) => <div className={complete ? 'complete' : ''} key={label}>
        {complete ? <CheckCircle2 size={16}/> : <Clock size={16}/>}
        <span><strong>{label}</strong><small>{complete ? 'Complete' : detail}</small></span>
      </div>)}
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
    <form className="admin-modal emergency-exception-modal" role="dialog" aria-modal="true" aria-label="Create Emergency Rental Exception" onSubmit={submit}>
      <div className="admin-modal-header danger">
        <div><p className="eyebrow">Extraordinary Case</p><h3>Release With Emergency Exception</h3></div>
        <button type="button" onClick={onCancel} aria-label="Close"><XCircle size={20}/></button>
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

  async function chargeCard(charge) {
    setChargingId(charge.id);
    await chargeRentalSavedCard?.(charge);
    setChargingId('');
  }

  return <div className="rental-charge-manager">
    <div className="rental-charge-heading"><strong>Fees, tolls &amp; add-ons</strong><button type="button" onClick={() => setOpen((value) => !value)}><Plus size={14}/> Add customer charge</button></div>
    {charges.length === 0 && <small>No booking-specific charges. Add one to email the billing link automatically, send it by text, or charge the saved card.</small>}
    {charges.map((charge) => <div className="extension-action-row" key={charge.id}>
      <div><span>{charge.name} • {prettyStatus(charge.status)}</span><small>{prettyStatus(charge.charge_type)} • {money(charge.amount)}{Number(charge.tax_amount) > 0 ? ` + ${money(charge.tax_amount)} tax` : ''} • {money(charge.total_amount)} total</small>{charge.last_admin_charge_error && <small className="form-error">Last card attempt: {charge.last_admin_charge_error}</small>}</div>
      {!charge.included_in_initial_payment && ['pending', 'failed', 'checkout_open'].includes(charge.status) && <div className="row-actions charge-collection-actions"><button type="button" onClick={() => sendPaymentLink?.(charge)}><Send size={14}/> Send payment link</button><button type="button" className="approve" disabled={chargingId === charge.id} onClick={() => chargeCard(charge)}><CreditCard size={14}/>{chargingId === charge.id ? ' Charging…' : ' Charge saved card'}</button><button type="button" className="reject" disabled={chargingId === charge.id} onClick={() => waiveRentalCharge?.(charge.id)}>Waive</button></div>}
    </div>)}
    {open && <form className="portal-form rental-charge-form" onSubmit={submit}>
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

function CancelRentalModal({ rental, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  return <div className="admin-modal-backdrop" role="presentation">
    <form className="admin-modal" role="dialog" aria-modal="true" aria-label="Confirm Rental Cancellation" onSubmit={(event) => {
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

function RentalOverrideModal({ title, actionLabel, rental, missingRequirements = [], onCancel, onConfirm }) {
  return <div className="admin-modal-backdrop" role="presentation">
    <div className="admin-modal" role="dialog" aria-modal="true" aria-label={title}>
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
    <form className="admin-modal" role="dialog" aria-modal="true" aria-label={override ? 'Override Pickup' : 'Mark Vehicle Picked Up'} onSubmit={submit}>
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

function RentalExtensionActions({ requests = [], vehicles = [], decideExtension, recordExtensionPayment, cancelApprovedExtension }) {
  const activeRequests = requests
    .filter((request) => ['pending', 'approved_pending_payment', 'activated', 'rejected'].includes(request.status))
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));

  if (!activeRequests.length) return null;

  return <div className="rental-extension-actions">
    <strong>Extension / Switch Requests</strong>
    {activeRequests.map((request) => {
      const replacement = vehicles.find((vehicle) => vehicle.id === request.replacement_vehicle_id);
      const isSwitch = request.request_kind === 'switch_car_continuation';
      return <div className={`extension-action-row ${request.status}`} key={request.id}>
        <div>
          <span>{isSwitch ? 'Switch vehicle continuation' : 'Same vehicle extension'} • {prettyStatus(request.status)}</span>
          <small>
            {isSwitch && replacement ? `${replacement.name} • ` : ''}
            Requested return {formatRentalDate(request.requested_return_date, request.requested_return_time)}
            {request.extension_total_amount ? ` • ${money(request.extension_total_amount)} due` : ''}
          </small>
          {isSwitch && request.status !== 'pending' && <small>{money(request.deposit_carried_amount || 0)} deposit carried{Number(request.deposit_increase_amount || 0) > 0 ? ` • ${money(request.deposit_increase_amount)} increase collected` : ''}{Number(request.deposit_decrease_amount || 0) > 0 ? ` • ${money(request.deposit_decrease_amount)} decrease refunded after original-car inspection` : ''}</small>}
          {request.customer_note && <small>Note: {request.customer_note}</small>}
        </div>
        <div className="mini-actions">
          {request.status === 'pending' && decideExtension && <button type="button" className="approve" onClick={() => decideExtension(request.id, true)}><CheckCircle2 size={14}/> Approve</button>}
          {request.status === 'pending' && decideExtension && <button type="button" className="reject" onClick={() => decideExtension(request.id, false)}><XCircle size={14}/> Reject</button>}
          {request.status === 'approved_pending_payment' && recordExtensionPayment && <button type="button" className="approve" onClick={() => recordExtensionPayment(request.id)}><CreditCard size={14}/> Record Payment</button>}
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

function ReturnCompletionPanel({ rental, onCancel, onComplete }) {
  const [inspection, setInspection] = useState({
    mileageChecked: false,
    endingMileage: rental.ending_mileage || rental.vehicles?.current_mileage || rental.starting_mileage || '',
    fuelChecked: false,
    damageChecked: false,
    damageFound: false,
    issueType: 'damage',
    depositDecision: 'release',
    damageNote: '',
    customerAction: 'review',
    vehicleDisposition: 'available',
    files: [],
  });
  const [saving, setSaving] = useState(false);
  const [mileageError, setMileageError] = useState('');
  const milesDriven = calculateMilesDriven(rental.starting_mileage, inspection.endingMileage);

  async function submit(event) {
    event.preventDefault();
    setMileageError('');
    const endingMileage = parseMileageInput(inspection.endingMileage);
    if (endingMileage === null) {
      setMileageError('Enter the ending mileage as a whole number.');
      return;
    }
    if (rental.starting_mileage !== null && rental.starting_mileage !== undefined && endingMileage < Number(rental.starting_mileage)) {
      setMileageError(`Ending mileage cannot be below pickup mileage (${formatMiles(rental.starting_mileage)}).`);
      return;
    }
    if (!inspection.mileageChecked || !inspection.fuelChecked || !inspection.damageChecked) {
      setMileageError('Complete the mileage, fuel, and condition checks before closing the rental.');
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

  return <form className="return-completion-panel" onSubmit={submit}>
    <div>
      <strong>Return Completion</strong>
      <span>{rental.vehicles?.name || 'Vehicle'} • {rental.profiles?.full_name || 'Client'}</span>
    </div>
    <label className="field-label">Ending mileage
      <input type="number" min={rental.starting_mileage || 0} max={MILEAGE_MAX} step="1" inputMode="numeric" title={`Whole-number mileage, max ${MILEAGE_MAX.toLocaleString('en-US')}.`} value={inspection.endingMileage} onChange={(event) => setInspection((current) => ({ ...current, endingMileage: event.target.value, mileageChecked: true }))} required />
    </label>
    {mileageError && <small className="form-error">{mileageError}</small>}
    {rental.starting_mileage !== null && rental.starting_mileage !== undefined && <small>Pickup mileage: {formatMiles(rental.starting_mileage)} • Miles driven: {formatMiles(milesDriven)}</small>}
    <div className="return-required-checks">
      <strong>Required release checks</strong>
      <label><input type="checkbox" checked={inspection.mileageChecked} onChange={(event) => update('mileageChecked', event.target.checked)} /> Mileage recorded and verified</label>
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
        <textarea value={inspection.damageNote} maxLength="1000" onChange={(event) => update('damageNote', limitText(event.target.value, 1000))} placeholder="Describe damage, incident, mileage/fuel issue, cleaning issue, or deposit reason..." />
        <input type="file" multiple accept="image/*,application/pdf" onChange={(event) => update('files', Array.from(event.target.files || []))} />
      </>}
    <div className="mini-actions">
      <button type="button" onClick={onCancel}>Cancel</button>
      <button type="submit" className="approve" disabled={saving}><CheckCircle2 size={14}/> {saving ? 'Closing...' : 'Close Rental'}</button>
    </div>
  </form>;
}

function RentalProgressTracker({ steps }) {
  const icons = {
    phone: ShieldCheck,
    vehicle: Car,
    agreement: FileSignature,
    payment: CreditCard,
    license: FileText,
    insurance: ShieldCheck,
    ready: CheckCircle2,
  };

  return <div className="rental-progress-tracker" aria-label="Rental progress">
    {steps.map((step) => {
      const Icon = icons[step.key] || CheckCircle2;
      return <div className="progress-step-wrap" key={step.key}>
          <div className={`progress-step ${step.state}`} title={`${step.label}: ${step.detail}`}>
            {step.complete ? <CheckCircle2 size={16} /> : <Icon size={16} />}
          </div>
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
      <span>{docLabel(document.document_type)} • {prettyStatus(document.status)}</span>
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
function Loading() { return <div className="loading-screen"><div className="road"><div className="loading-car">▰</div></div><h1>Loading admin portal...</h1></div>; }
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
      <p className="muted">{email} is signed in, but this account is not marked as an admin in Supabase.</p>
      <div className="auth-help-box">
        <strong>Fix in Supabase SQL Editor</strong>
        <code>{`insert into public.profiles (id, email, role)
select id, email, 'admin'
from auth.users
where lower(email) = lower('${email}')
on conflict (id) do update
set email = excluded.email,
    role = 'admin';`}</code>
        <span>Then refresh this page.</span>
      </div>
      <button className="primary-btn" onClick={signOut}>Log Out</button>
    </div>
  </div>;
}
function Notice({ notice, onDismiss }) { return <div className={`notice-banner ${notice.type || 'info'}`}><span>{notice.text}</span><button type="button" onClick={onDismiss}>Dismiss</button></div>; }

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
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
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
      if (isOverdue(rental.return_date, rental.status)) {
        items.push({ id: `overdue-${rental.id}`, bucket: 'return_attention', severity: 'critical', title: 'Rental overdue', subtitle: `${customer} • ${vehicle}`, detail: `Return was due ${formatRentalDate(rental.return_date, rental.return_time)}`, rental, nextStatus: 'overdue' });
      } else if (isDueSoon(rental.return_date)) {
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
    items.push({
      id: `extension-${extension.id}`,
      bucket: waitingOnPayment ? 'payment_needed' : 'needs_approval',
      severity: waitingOnPayment ? 'warning' : 'info',
      title: waitingOnPayment ? 'Extension payment required' : 'Extension needs decision',
      subtitle: `${customer} • ${vehicle}`,
      detail: waitingOnPayment
        ? `${money(extension.extension_total_amount)} due before ${formatRentalDate(extension.requested_return_date, extension.requested_return_time)} activates.`
        : `Requested return ${formatRentalDate(extension.requested_return_date, extension.requested_return_time)}.`,
      extension,
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

function getRentalProgressSteps(rental, rentalDocuments = []) {
  const license = latestDocument(rentalDocuments, 'license');
  const insurance = latestDocument(rentalDocuments, 'insurance');
  const hasLicense = Boolean(license && license.status !== 'rejected');
  const hasInsurance = Boolean(insurance && insurance.status !== 'rejected');
  const phoneVerified = Boolean(rental.profiles?.phone_verified || rental.profiles?.phone_verified_at);
  const identityVerified = rental.profiles?.identity_verification_status === 'verified';
  const hasDatesAndVehicle = Boolean(rental.vehicle_id && rental.pickup_date && rental.return_date);
  const agreementSigned = Boolean(rental.agreement_signed);
  const paymentPaid = (rental.payment_status || 'pending') === 'paid';
  const readyForPickup = rental.status === 'ready_for_pickup' || (
    phoneVerified &&
    identityVerified &&
    hasDatesAndVehicle &&
    agreementSigned &&
    paymentPaid &&
    hasLicense &&
    hasInsurance
  );

  const steps = [
    { key: 'phone', label: 'Phone', complete: phoneVerified, detail: phoneVerified ? 'Phone verified' : 'Phone verification needed' },
    { key: 'identity', label: 'Identity', complete: identityVerified, detail: identityVerified ? 'Stripe Identity verified' : `Stripe Identity ${prettyStatus(rental.profiles?.identity_verification_status || 'unverified')}` },
    { key: 'vehicle', label: 'Vehicle', complete: hasDatesAndVehicle, detail: hasDatesAndVehicle ? 'Dates and vehicle selected' : 'Dates or vehicle missing' },
    { key: 'license', label: 'License', complete: hasLicense, detail: hasLicense ? `Driver license ${prettyStatus(license.status)}` : 'Driver license missing' },
    { key: 'insurance', label: 'Insurance', complete: hasInsurance, detail: hasInsurance ? `Insurance ${prettyStatus(insurance.status)}` : 'Insurance missing' },
    { key: 'agreement', label: 'Agreement', complete: agreementSigned, detail: agreementSigned ? 'Agreement signed' : 'Agreement not signed' },
    { key: 'payment', label: 'Payment', complete: paymentPaid, detail: paymentPaid ? 'Payment complete' : `Payment ${prettyStatus(rental.payment_status || 'pending')}` },
    { key: 'ready', label: 'Ready', complete: readyForPickup, detail: readyForPickup ? 'Ready for pickup' : 'Not ready for pickup' },
  ];

  const firstMissingIndex = steps.findIndex((step) => !step.complete);
  return steps.map((step, index) => ({
    ...step,
    state: step.complete ? 'complete' : index === firstMissingIndex ? 'current' : 'missing',
  }));
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

function rentalFilterOptions() {
  return [
    { key: 'needs_action', label: 'Needs Action' },
    { key: 'ready_pickup', label: 'Ready For Pickup' },
    { key: 'cars_out', label: 'Cars Out' },
    { key: 'returns_today', label: 'Returns Today' },
    { key: 'extensions', label: 'Extensions Pending' },
    { key: 'maintenance', label: 'Maintenance' },
    { key: 'all', label: 'All' },
  ];
}

function rentalMatchesFilter(rental, filter, { documents = [], extensionRequests = [], vehicles = [] } = {}) {
  if (filter === 'all') return true;
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
    isOverdue(rental.return_date, rental.status) ||
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

function customerRiskProfile(profile, rentals, documents, reports) {
  const completed = rentals.filter((r) => r.status === 'completed').length;
  const late = rentals.filter((r) => r.status === 'overdue' || r.late_return_count > 0 || isOverdue(r.return_date, r.status)).length;
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
  extensionRequests = [],
  rentalCharges = [],
  depositAllocations = [],
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

  return events.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}
function paymentEventMatchesFilter(event, filter) {
  if (filter === 'all') return true;
  return event.type === filter || event.statusGroup === filter;
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
function tabTitle(tab) { return ({ dashboard:'Dashboard', queue:'Operations Queue', payments:'Payments', calendar:'Fleet Calendar', 'new-booking':'New Booking', rentals:'Rental Manager', customers:'Customers', vehicles:'Fleet Manager', documents:'Document Review', emails:'Communications', audit:'Audit Log', settings:'Settings' })[tab] || 'Admin Portal'; }
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
  if (preference === 'admin_stripe') return 'Payment starts as due. Stripe Checkout unlocks in the procedure console after every prerequisite passes.';
  if (preference === 'external') return 'Payment starts as due. Record it only after the external payment has cleared and every prerequisite passes.';
  if (preference === 'later') return 'Payment starts as due. The collection method can be chosen later in the procedure console.';
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
function promotionPlacementLabel(promotion) {
  const pageLabel = (page) => page === 'index.html' ? 'Home' : page === 'cars.html' ? 'Cars' : page;
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
function isOverdue(returnDate, status) { if (!returnDate || ['completed','cancelled'].includes(status)) return false; return new Date(`${returnDate}T23:59:59`) < new Date(); }
function isDueSoon(returnDate) { if (!returnDate) return false; const due = new Date(`${returnDate}T23:59:59`); const now = new Date(); const hours = (due - now) / 36e5; return hours > 0 && hours <= 30; }
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
function docLabel(type) { return type === 'license' ? 'Driver License' : type === 'insurance' ? 'Insurance Policy' : prettyStatus(type); }
function prettyVehicleStatus(status) { return prettyStatus(status || 'available'); }
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

createRoot(document.getElementById('root')).render(<App />);
