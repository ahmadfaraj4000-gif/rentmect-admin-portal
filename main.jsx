import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  Car,
  CheckCircle2,
  Clock,
  CreditCard,
  FileCheck,
  FileText,
  Gauge,
  ImagePlus,
  LogOut,
  Mail,
  MessageCircle,
  Plus,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  Wrench,
  XCircle,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import './styles.css';

const RENTMECT_ADDRESS = import.meta.env.VITE_RENTMECT_ADDRESS || '12 Holmes Circle, Farmington, CT';
const CT_TAX_RATE = 0.0635;
const DOCUMENT_BUCKET = 'rental-documents';
const BLOCKING_RENTAL_STATUSES = ['pending', 'documents_needed', 'document_review', 'ready_for_pickup', 'approved', 'active', 'overdue', 'return_initiated'];
const BLOCKING_VEHICLE_STATUSES = ['maintenance', 'unavailable', 'inactive'];
const TURNAROUND_BUFFER_MINUTES = 180;

const vehicleStatuses = ['available', 'maintenance', 'unavailable', 'inactive'];
const SYSTEM_VEHICLE_STATUSES = ['reserved', 'rented'];

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [authMessage, setAuthMessage] = useState('');
  const [notice, setNotice] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
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

  const [selectedRentalId, setSelectedRentalId] = useState('');
  const [replyText, setReplyText] = useState('');

  const [editingVehicleId, setEditingVehicleId] = useState('');
  const [editVehicleForm, setEditVehicleForm] = useState(null);

  const [mockForm, setMockForm] = useState({
    customerEmail: '',
    vehicleId: '',
    pickupDate: '',
    returnDate: '',
    pickupTime: '9:00 AM',
    returnTime: '9:00 AM',
  });

  const [vehicleForm, setVehicleForm] = useState({
    name: '', brand: '', model: '', vehicle_type: '', plate_number: '', vin: '', daily_rate: '', security_deposit: '', status: 'available'
  });

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
      .filter((r) => isThisMonth(r.created_at) && !['cancelled'].includes(r.status))
      .reduce((sum, r) => sum + Number(r.rental_total || 0) + Number(r.tax_amount || 0), 0);
    const deposits = paidRentals
      .filter((r) => ['ready_for_pickup', 'approved', 'active', 'overdue', 'return_initiated'].includes(r.status))
      .reduce((sum, r) => sum + Number(r.security_deposit || 0), 0);
    return { active, dueSoon, overdue, monthRevenue, deposits };
  }, [paidRentals]);

  const operationsQueue = useMemo(() => buildOperationsQueue({ rentals, documents, messages, reports, extensionRequests }), [rentals, documents, messages, reports, extensionRequests]);

  const filteredRentals = useMemo(() => {
    const q = search.toLowerCase().trim();
    return paidRentals.filter((r) =>
      rentalMatchesFilter(r, rentalFilter, { documents, extensionRequests, vehicles }) &&
      (!q ||
      [r.vehicles?.name, r.profiles?.full_name, r.profiles?.phone, r.user_email, r.status]
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

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setIsAdminUser(false);
  }

  async function loadAllData() {
    setLoading(true);
    const [profilesRes, vehiclesRes, rentalsRes, pendingBookingsRes, documentsRes, messagesRes, reportsRes, extensionsRes] = await Promise.all([
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
    ]);

    if (profilesRes.data) setProfiles(profilesRes.data);
    if (vehiclesRes.data) setVehicles(vehiclesRes.data);
    if (rentalsRes.data) setRentals(rentalsRes.data);
    if (pendingBookingsRes.data) setPendingBookings(pendingBookingsRes.data);
    if (documentsRes.data) setDocuments(documentsRes.data);
    if (messagesRes.data) setMessages(messagesRes.data);
    if (reportsRes.data) setReports(reportsRes.data);
    if (extensionsRes.data) setExtensionRequests(extensionsRes.data);
    setLoading(false);
  }

  async function isVehicleAvailable(vehicleId, startDate, pickupTime, endDate, returnTime) {
    const vehicle = vehicles.find((item) => item.id === vehicleId);
    if (BLOCKING_VEHICLE_STATUSES.includes(String(vehicle?.status || '').toLowerCase())) {
      return false;
    }

    const { data, error } = await supabase
      .from('rentals')
      .select('pickup_date, return_date, pickup_time, return_time, status')
      .eq('vehicle_id', vehicleId)
      .in('status', BLOCKING_RENTAL_STATUSES);

    if (error) {
      notify(error.message);
      return false;
    }

    return !(data || []).some((rental) => rentalPeriodsOverlap({
      pickupDate: startDate,
      pickupTime,
      returnDate: endDate,
      returnTime,
    }, rental));
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
      const defaultMileage = rental?.starting_mileage ?? rental?.vehicles?.current_mileage ?? '';
      const enteredMileage = window.prompt('Enter the starting mileage for this pickup.', defaultMileage ? String(defaultMileage) : '');
      if (enteredMileage === null) return;
      const startingMileage = parseMileageInput(enteredMileage);
      if (startingMileage === null) return notify('Starting mileage must be a whole number.');
      if (Number(rental?.vehicles?.current_mileage || 0) > 0 && startingMileage < Number(rental.vehicles.current_mileage)) {
        return notify(`Starting mileage cannot be below the vehicle's current mileage (${formatMiles(rental.vehicles.current_mileage)}).`);
      }

      if (rental && !['document_review', 'approved', 'ready_for_pickup'].includes(rental.status)) {
        const { error: readyError } = await supabase
          .from('rentals')
          .update({ status: 'ready_for_pickup' })
          .eq('id', id);
        if (readyError) return notify(readyError.message);
      }
      const { data, error } = await supabase.rpc('admin_mark_rental_active', {
        p_rental_id: id,
        p_starting_mileage: startingMileage,
        p_override_missing_requirements: Boolean(options.overrideMissingRequirements),
        p_missing_requirements: options.missingRequirements || [],
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

    if (status === 'ready_for_pickup' && options.overrideMissingRequirements) {
      const { data, error } = await supabase.rpc('admin_override_rental_ready_for_pickup', {
        p_rental_id: id,
        p_missing_requirements: options.missingRequirements || [],
      });
      if (error) return notify(error.message);
      if (data) {
        setRentals((current) => current.map((item) =>
          item.id === id
            ? { ...item, ...data, vehicles: item.vehicles ? { ...item.vehicles, status: 'reserved' } : item.vehicles }
            : item
        ));
        if (data.vehicle_id) {
          setVehicles((current) => current.map((vehicle) =>
            vehicle.id === data.vehicle_id ? { ...vehicle, status: 'reserved' } : vehicle
          ));
        }
      } else {
        applyLocalStatus();
      }
      notify('Rental override marked ready for pickup.', 'success');
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
      const { error } = await supabase.rpc('admin_cancel_rental', { p_rental_id: id });
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

    if (inspection.depositDecision === 'hold' || inspection.damageFound) {
      const { error: depositError } = await supabase
        .from('rentals')
        .update({
          deposit_status: 'held',
          deposit_held_amount: Math.max(Number(rental.deposit_held_amount || 0), Number(rental.security_deposit || 0)),
        })
        .eq('id', rental.id);
      if (depositError) return notify(depositError.message);
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

    const { error: inspectionError } = await supabase
      .from('rental_return_inspections')
      .insert({
        rental_id: rental.id,
        user_id: rental.user_id,
        mileage_checked: Boolean(inspection.mileageChecked || inspection.skipChecklist),
        ending_mileage: parseMileageInput(inspection.endingMileage),
        fuel_checked: Boolean(inspection.fuelChecked || inspection.skipChecklist),
        damage_checked: Boolean(inspection.damageChecked || inspection.skipChecklist),
        damage_found: Boolean(inspection.damageFound),
        deposit_decision: inspection.damageFound ? 'hold' : inspection.depositDecision || 'release',
        notes: inspection.skipChecklist ? 'Admin skipped return checklist.' : inspection.damageNote || null,
        skipped: Boolean(inspection.skipChecklist),
      });
    if (inspectionError) return notify(inspectionError.message);

    await updateRentalStatus(rental.id, 'completed', { endingMileage: inspection.endingMileage });
  }

  async function recordTestPayment(id) {
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
              vehicles: rental.vehicles ? { ...rental.vehicles, status: 'reserved' } : rental.vehicles,
            }
          : rental
      ));
      setVehicles((current) => current.map((vehicle) =>
        vehicle.id === paidRental.vehicle_id ? { ...vehicle, status: 'reserved' } : vehicle
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
    const { error } = await supabase.rpc('record_admin_local_rental_extension_payment', {
      p_extension_request_id: id,
    });
    if (error) return notify(error.message);
    notify('Extension payment recorded and the rental return window is updated.', 'success');
    loadAllData();
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
      security_deposit: vehicle.security_deposit || '',
      status: SYSTEM_VEHICLE_STATUSES.includes(String(vehicle.status || '').toLowerCase()) ? '' : vehicle.status || 'available',
    });
  }

  function cancelEditVehicle() {
    setEditingVehicleId('');
    setEditVehicleForm(null);
  }

  async function saveVehicleEdit(id) {
    if (!editVehicleForm) return;

    const { status, ...vehicleFields } = editVehicleForm;
    const { error } = await supabase
      .from('vehicles')
      .update({
        ...vehicleFields,
        ...(status ? { status } : {}),
        daily_rate: Number(editVehicleForm.daily_rate || 0),
        security_deposit: Number(editVehicleForm.security_deposit || 0),
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

  async function createMockReservation(event) {
    event.preventDefault();

    const profile = profiles.find((p) =>
      p.email === mockForm.customerEmail ||
      p.full_name?.toLowerCase() === mockForm.customerEmail.toLowerCase()
    );

    const vehicle = vehicles.find((v) => v.id === mockForm.vehicleId);

    if (!profile) return notify('Customer not found in profiles. Use an existing customer profile.');
    if (!vehicle) return notify('Choose a vehicle.');

    const available = await isVehicleAvailable(vehicle.id, mockForm.pickupDate, mockForm.pickupTime, mockForm.returnDate, mockForm.returnTime);
    if (!available) return notify('Vehicle is not available for that pickup and return time.');

    const days = getRentalDays(mockForm.pickupDate, mockForm.returnDate);
    if (days < 1) return notify('Return date must be after pickup date.');

    const rentalTotal = Number(vehicle.daily_rate || 0) * days;
    const taxAmount = rentalTotal * CT_TAX_RATE;

    const { error } = await supabase.from('rentals').insert({
      user_id: profile.id,
      vehicle_id: vehicle.id,
      pickup_date: mockForm.pickupDate,
      return_date: mockForm.returnDate,
      pickup_time: mockForm.pickupTime,
      return_time: mockForm.returnTime,
      status: 'approved',
      rental_total: rentalTotal,
      tax_amount: taxAmount,
      security_deposit: Number(vehicle.security_deposit || 0),
      is_mock: true,
    });

    if (error) return notify(error.message);

    notify('Mock reservation created without payment.');
    setMockForm({ customerEmail: '', vehicleId: '', pickupDate: '', returnDate: '', pickupTime: '9:00 AM', returnTime: '9:00 AM' });
    loadAllData();
  }

  async function addVehicle(event) {
    event.preventDefault();
    const { error } = await supabase.from('vehicles').insert({
      ...vehicleForm,
      daily_rate: Number(vehicleForm.daily_rate || 0),
      security_deposit: Number(vehicleForm.security_deposit || 0),
    });
    if (error) return notify(error.message);
    setVehicleForm({ name: '', brand: '', model: '', vehicle_type: '', plate_number: '', vin: '', daily_rate: '', security_deposit: '', status: 'available' });
    loadAllData();
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

  if (loading) return <Loading />;
  if (!session) return <Login authForm={authForm} setAuthForm={setAuthForm} handleLogin={handleLogin} authMessage={authMessage} />;
  if (!isAdminUser) return <NotAdmin email={session.user.email} signOut={signOut} />;

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="brand-block"><div className="brand-mark">RM</div><div><strong>Rent Me CT</strong><span>Admin Portal</span></div></div>
        <nav className="side-nav">
          <button className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}><Gauge size={18}/> Dashboard</button>
          <button className={activeTab === 'queue' ? 'active' : ''} onClick={() => setActiveTab('queue')}><AlertTriangle size={18}/> Queue</button>
          <button className={activeTab === 'calendar' ? 'active' : ''} onClick={() => setActiveTab('calendar')}><CalendarClock size={18}/> Calendar</button>
          <button className={activeTab === 'rentals' ? 'active' : ''} onClick={() => setActiveTab('rentals')}><CalendarClock size={18}/> Rentals</button>
          <button className={activeTab === 'customers' ? 'active' : ''} onClick={() => setActiveTab('customers')}><UserRound size={18}/> Customers</button>
          <button className={activeTab === 'vehicles' ? 'active' : ''} onClick={() => setActiveTab('vehicles')}><Car size={18}/> Vehicles</button>
          <button className={activeTab === 'damage' ? 'active' : ''} onClick={() => setActiveTab('damage')}><Wrench size={18}/> Damage</button>
          <button className={activeTab === 'documents' ? 'active' : ''} onClick={() => setActiveTab('documents')}><FileText size={18}/> Documents</button>
          <button className={activeTab === 'messages' ? 'active' : ''} onClick={() => setActiveTab('messages')}><MessageCircle size={18}/> Messages</button>
          <button className={activeTab === 'mock' ? 'active' : ''} onClick={() => setActiveTab('mock')}><Plus size={18}/> Mock Reservation</button>
        </nav>
        <button className="logout-btn" onClick={signOut}><LogOut size={17}/> Log Out</button>
      </aside>

      <main className="admin-main">
        {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}
        <header className="admin-header">
          <div><p className="eyebrow">Operations Center</p><h1>{tabTitle(activeTab)}</h1><span>{session.user.email}</span></div>
          <div className="header-actions"><button onClick={loadAllData} className="secondary-btn">Refresh</button></div>
        </header>

        {activeTab === 'dashboard' && <Dashboard dashboard={dashboard} rentals={paidRentals} operationsQueue={operationsQueue} documents={documents} messages={messages} reports={reports} sendManualReminder={sendManualReminder} updateRentalStatus={updateRentalStatus} openDocument={openDocument} markDocument={markDocument} documentsByRentalId={documentsByRentalId} />}
        {activeTab === 'queue' && <OperationsQueue queue={operationsQueue} updateRentalStatus={updateRentalStatus} recordTestPayment={recordTestPayment} openDocument={openDocument} markDocument={markDocument} decideExtension={decideExtension} recordExtensionPayment={recordExtensionPayment} />}
        {activeTab === 'calendar' && <FleetCalendar vehicles={vehicles} rentals={rentals} />}
        {activeTab === 'rentals' && <Rentals rentals={filteredRentals} search={search} setSearch={setSearch} rentalFilter={rentalFilter} setRentalFilter={setRentalFilter} updateRentalStatus={updateRentalStatus} completeRentalReturn={completeRentalReturn} recordTestPayment={recordTestPayment} recordExtensionPayment={recordExtensionPayment} extensionRequests={extensionRequests} vehicles={vehicles} reports={reports} decideExtension={decideExtension} sendManualReminder={sendManualReminder} openDocument={openDocument} markDocument={markDocument} deleteDocument={deleteDocument} documents={documents} documentsByRentalId={documentsByRentalId} />}
        {activeTab === 'customers' && <Customers profiles={profiles} rentals={rentals} documentsByUserId={documentsByUserId} documents={documents} reports={reports} openDocument={openDocument} />}
        {activeTab === 'vehicles' && <Vehicles vehicles={vehicles} vehicleForm={vehicleForm} setVehicleForm={setVehicleForm} addVehicle={addVehicle} updateVehicleStatus={updateVehicleStatus} editingVehicleId={editingVehicleId} editVehicleForm={editVehicleForm} setEditVehicleForm={setEditVehicleForm} startEditVehicle={startEditVehicle} cancelEditVehicle={cancelEditVehicle} saveVehicleEdit={saveVehicleEdit} deleteVehicle={deleteVehicle} />}
        {activeTab === 'damage' && <DamageCases reports={reports} updateDamageCase={updateDamageCase} setCustomerStatus={setCustomerStatus} />}
        {activeTab === 'documents' && <Documents documents={documents} markDocument={markDocument} openDocument={openDocument} deleteDocument={deleteDocument} />}
        {activeTab === 'messages' && <Messages rentals={rentals} messages={messages} selectedRental={selectedRental} setSelectedRentalId={setSelectedRentalId} replyText={replyText} setReplyText={setReplyText} sendReply={sendReply} />}
        {activeTab === 'mock' && <MockReservation mockForm={mockForm} setMockForm={setMockForm} profiles={profiles} vehicles={vehicles} createMockReservation={createMockReservation} />}
      </main>
    </div>
  );
}

function Dashboard({ dashboard, rentals, operationsQueue, documents, messages, reports, sendManualReminder, updateRentalStatus, openDocument, markDocument, documentsByRentalId }) {
  const recentRentals = rentals.slice(0, 5);
  const paidRentalIds = new Set(rentals.map((rental) => rental.id));
  const paidDocuments = documents.filter((document) => paidRentalIds.has(document.rental_id || document.rentals?.id));
  const paidMessages = messages.filter((message) => paidRentalIds.has(message.rental_id || message.rentals?.id));
  const paidReports = reports.filter((report) => paidRentalIds.has(report.rental_id || report.rentals?.id));
  return <>
    <section className="metric-grid">
      <Metric icon={Car} label="Cars Out" value={dashboard.active.length} />
      <Metric icon={AlertTriangle} label="Overdue" value={dashboard.overdue.length} danger={dashboard.overdue.length > 0} />
      <Metric icon={Banknote} label="Month Revenue" value={money(dashboard.monthRevenue)} />
      <Metric icon={CreditCard} label="Active Deposits" value={money(dashboard.deposits)} />
    </section>
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
      {buckets.map(([bucket, label]) => <section className="operations-bucket" key={bucket}>
        <h4>{label}</h4>
        <div className="table-list">
          {queue.filter((item) => item.bucket === bucket).length === 0 && <p className="muted">Clear.</p>}
          {queue.filter((item) => item.bucket === bucket).map((item) => <div className={`data-row queue-row ${item.severity}`} key={item.id}>
        <div>
          <strong>{item.title}</strong>
          <span>{item.subtitle}</span>
          <small>{item.detail}</small>
        </div>
        <div className="row-actions">
          <em>{item.severity}</em>
          {item.rental && item.localPaymentAction && <button className="approve" onClick={() => recordTestPayment(item.rental.id)}><CreditCard size={16}/> Record Local Payment</button>}
          {item.rental && item.nextStatus && <button className="approve" onClick={() => updateRentalStatus(item.rental.id, item.nextStatus)}><CheckCircle2 size={16}/> {prettyStatus(item.nextStatus)}</button>}
          {item.extension && item.extension.status === 'pending' && <button className="approve" onClick={() => decideExtension(item.extension.id, true)}><CheckCircle2 size={16}/> Approve</button>}
          {item.extension && item.extension.status === 'pending' && <button className="reject" onClick={() => decideExtension(item.extension.id, false)}><XCircle size={16}/> Decline</button>}
          {item.extension && item.extension.status === 'approved_pending_payment' && <button className="approve" onClick={() => recordExtensionPayment(item.extension.id)}><CreditCard size={16}/> Record Payment</button>}
          {item.document && <button onClick={() => openDocument(item.document)}><FileText size={16}/> Open</button>}
          {item.document && <button className="approve" onClick={() => markDocument(item.document.id, 'approved')}><CheckCircle2 size={16}/> Approve</button>}
          {item.document && <button className="reject" onClick={() => markDocument(item.document.id, 'rejected')}><XCircle size={16}/> Reject</button>}
        </div>
      </div>)}
        </div>
      </section>)}
    </div>
  </Panel>;
}

function FleetCalendar({ vehicles, rentals }) {
  const days = calendarDays(21);
  const rentalsByVehicle = useMemo(() => {
    const grouped = {};
    rentals.filter((r) => BLOCKING_RENTAL_STATUSES.includes(r.status)).forEach((r) => {
      if (!grouped[r.vehicle_id]) grouped[r.vehicle_id] = [];
      grouped[r.vehicle_id].push(r);
    });
    return grouped;
  }, [rentals]);

  return <Panel title="Fleet Calendar" eyebrow="Date-Based Availability">
    <div className="calendar-scroller">
      <div className="fleet-calendar">
        <div className="calendar-cell calendar-head sticky-col">Vehicle</div>
        {days.map((day) => <div className="calendar-cell calendar-head" key={day.iso}>{day.label}</div>)}
        {vehicles.map((vehicle) => {
          const vehicleRentals = rentalsByVehicle[vehicle.id] || [];
          const vehicleBlocked = BLOCKING_VEHICLE_STATUSES.includes(String(vehicle.status || '').toLowerCase());
          return <React.Fragment key={vehicle.id}>
            <div className="calendar-cell sticky-col vehicle-name">
              <strong>{vehicle.name}</strong>
              <span>{prettyVehicleStatus(vehicle.status)}</span>
            </div>
            {days.map((day) => {
              const dayStart = parseRentMeCtDateTime(day.iso, '12:00 AM');
              const dayEnd = parseRentMeCtDateTime(day.iso, '11:59 PM');
              const rental = vehicleRentals.find((r) => rentalBlocksCalendarDay(r, dayStart, dayEnd));
              const unavailable = vehicleBlocked || Boolean(rental);
              const blockedUntil = rental ? getRentalBlockedUntil(rental) : null;
              const rentalTitle = rental
                ? `${rental.profiles?.full_name || 'Client'} - ${prettyStatus(rental.status)}. Booked ${formatRentalDate(rental.pickup_date, rental.pickup_time)} to ${formatRentalDate(rental.return_date, rental.return_time)}. Next pickup after ${formatDateTime(blockedUntil)}.`
                : '';
              return <div className={calendarCellClass({ unavailable, vehicleBlocked, rental, dayIso: day.iso })} key={`${vehicle.id}-${day.iso}`} title={rental ? rentalTitle : vehicleBlocked ? prettyVehicleStatus(vehicle.status) : 'Available'}>
                {rental ? <span>{calendarBlockLabel(rental, day.iso)}</span> : vehicleBlocked ? <span>Maintenance</span> : <span>Available</span>}
              </div>;
            })}
          </React.Fragment>;
        })}
      </div>
    </div>
  </Panel>;
}

function Rentals({ rentals, search, setSearch, rentalFilter, setRentalFilter, updateRentalStatus, completeRentalReturn, recordTestPayment, recordExtensionPayment, extensionRequests, vehicles, reports, decideExtension, sendManualReminder, openDocument, markDocument, deleteDocument, documents = [], documentsByRentalId }) {
  const pendingExtensions = extensionRequests.filter((request) => request.status === 'pending');
  const approvedUnpaidExtensions = extensionRequests.filter((request) => request.status === 'approved_pending_payment');

  return <>
    <Panel title="Extension Requests" eyebrow="Return Changes">
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
            <small>{money(request.extension_total_amount)} due for {request.extension_days || 1} extension day(s)</small>
          </div>
          <div className="row-actions">
            <button className="approve" onClick={()=>recordExtensionPayment(request.id)}><CreditCard size={15}/> Record Extension Payment</button>
          </div>
        </div>)}
      </div>
    </Panel>
    <Panel title="All Rentals" eyebrow="Reservations">
      <div className="filter-pills" role="group" aria-label="Rental filters">
        {rentalFilterOptions().map((filter) => (
          <button type="button" key={filter.key} className={rentalFilter === filter.key ? 'active' : ''} onClick={() => setRentalFilter(filter.key)}>
            {filter.label}
          </button>
        ))}
      </div>
      <div className="search-row"><Search size={18}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search customer, car, phone, status..." /></div>
      {rentals.length === 0 && <p className="muted">No rentals match this view.</p>}
      <div className="table-list">{rentals.map((r) => <RentalRow key={r.id} rental={r} updateRentalStatus={updateRentalStatus} completeRentalReturn={completeRentalReturn} recordTestPayment={recordTestPayment} recordExtensionPayment={recordExtensionPayment} extensionRequests={extensionRequests} vehicles={vehicles} reports={reports} decideExtension={decideExtension} sendManualReminder={sendManualReminder} detailed rentalDocuments={documentsByRentalId[r.id] || []} allDocuments={documents} openDocument={openDocument} markDocument={markDocument} deleteDocument={deleteDocument} />)}</div>
    </Panel>
  </>;
}

function Customers({ profiles, rentals, documentsByUserId, documents, reports, openDocument }) {
  return <Panel title="Client Accounts" eyebrow="Customers">
    <div className="table-list">
      {profiles.map((p) => {
        const customerRentals = rentals.filter((r) => r.user_id === p.id);
        const count = customerRentals.length;
        const customerDocuments = documentsByUserId[p.id] || [];
        const risk = customerRiskProfile(p, customerRentals, customerDocuments, reports.filter((r) => r.user_id === p.id));
        return <div className="data-row customer-row" key={p.id}>
          <div>
            <strong>{p.full_name || 'Unnamed Client'}</strong>
            <span>{p.email || p.id}</span>
            <small className="customer-phone">Phone: {p.phone || 'Not provided'}</small>
            <small className={p.phone_verified ? 'verified-badge' : 'unverified-badge'}>{p.phone_verified ? 'Phone Verified' : 'Not Verified'}</small>
            {p.phone_verified_at && <small className="customer-verified-time">Verified: {new Date(p.phone_verified_at).toLocaleString()}</small>}
            <div className={`risk-box ${risk.level}`}>
              <strong>Risk: {prettyStatus(risk.level)}</strong>
              <span>{risk.summary}</span>
              <small>Completed: {risk.completed} • Late/overdue: {risk.late} • Rejected docs: {risk.rejectedDocs} • Open reports: {risk.openReports} • Deposits held: {money(risk.depositsHeld)} • Released: {money(risk.depositsReleased)}</small>
              {p.admin_notes && <small>Admin notes: {p.admin_notes}</small>}
            </div>
            <DocumentMiniList documents={customerDocuments} openDocument={openDocument} />
          </div>
          <em>{count} rentals</em>
        </div>;
      })}
    </div>
  </Panel>;
}

function Vehicles({ vehicles, vehicleForm, setVehicleForm, addVehicle, updateVehicleStatus, editingVehicleId, editVehicleForm, setEditVehicleForm, startEditVehicle, cancelEditVehicle, saveVehicleEdit, deleteVehicle }) {
  const update = (k, v) => setVehicleForm({ ...vehicleForm, [k]: v });
  const updateEdit = (k, v) => setEditVehicleForm({ ...editVehicleForm, [k]: v });

  return <section className="content-grid">
    <Panel title="Fleet" eyebrow="Vehicles">
      {vehicles.map((v) => {
        const isEditing = editingVehicleId === v.id;

        if (isEditing) {
          return <div className="data-row" key={v.id}>
            <div className="portal-form">
              <input placeholder="Vehicle name" value={editVehicleForm.name} onChange={(e)=>updateEdit('name', e.target.value)} required />
              <input placeholder="Brand" value={editVehicleForm.brand} onChange={(e)=>updateEdit('brand', e.target.value)} />
              <input placeholder="Model" value={editVehicleForm.model} onChange={(e)=>updateEdit('model', e.target.value)} />
              <input placeholder="Type" value={editVehicleForm.vehicle_type} onChange={(e)=>updateEdit('vehicle_type', e.target.value)} />
              <input placeholder="Plate Number" value={editVehicleForm.plate_number} onChange={(e)=>updateEdit('plate_number', e.target.value)} />
              <input placeholder="VIN" value={editVehicleForm.vin} onChange={(e)=>updateEdit('vin', e.target.value)} />
              <input type="number" step="0.01" placeholder="Daily Rate" value={editVehicleForm.daily_rate} onChange={(e)=>updateEdit('daily_rate', e.target.value)} />
              <input type="number" step="0.01" placeholder="Security Deposit" value={editVehicleForm.security_deposit} onChange={(e)=>updateEdit('security_deposit', e.target.value)} />
              <select value={editVehicleForm.status} onChange={(e)=>updateEdit('status', e.target.value)}>
                <option value="">Keep system status ({prettyVehicleStatus(v.status)})</option>
                {vehicleStatuses.map(s=><option key={s} value={s}>{prettyStatus(s)}</option>)}
              </select>
            </div>
            <div className="row-actions">
              <button className="approve" onClick={()=>saveVehicleEdit(v.id)}><CheckCircle2 size={16}/> Save</button>
              <button className="secondary-btn" onClick={cancelEditVehicle}>Cancel</button>
            </div>
          </div>;
        }

        return <div className="data-row" key={v.id}>
          <div>
            <strong>{v.name}</strong>
            <span>{v.brand} {v.model} • {v.vehicle_type}</span>
            <small>Plate: {v.plate_number || 'TBD'} • VIN: {v.vin || 'TBD'} • Mileage: {formatMiles(v.current_mileage)}</small>
          </div>
          <div className="row-actions">
            <em>{money(v.daily_rate)}/day</em>
            <span className={`fleet-status-badge ${String(v.status || 'available').toLowerCase()}`}>{prettyVehicleStatus(v.status)}</span>
            {SYSTEM_VEHICLE_STATUSES.includes(String(v.status || '').toLowerCase()) ? (
              <span className="system-owned-status">System controlled</span>
            ) : (
              <select value={v.status || 'available'} onChange={(e)=>updateVehicleStatus(v.id, e.target.value)}>{vehicleStatuses.map(s=><option key={s} value={s}>{prettyStatus(s)}</option>)}</select>
            )}
            <button onClick={()=>startEditVehicle(v)}>Edit</button>
            <button className="reject" onClick={()=>deleteVehicle(v.id)}><XCircle size={16}/> Delete</button>
          </div>
        </div>;
      })}
    </Panel>
    <Panel title="Add Vehicle" eyebrow="Fleet Manager">
      <form className="portal-form" onSubmit={addVehicle}>
        <input placeholder="Vehicle name e.g. Audi Q5 #474" value={vehicleForm.name} onChange={(e)=>update('name', e.target.value)} required />
        <input placeholder="Brand" value={vehicleForm.brand} onChange={(e)=>update('brand', e.target.value)} />
        <input placeholder="Model" value={vehicleForm.model} onChange={(e)=>update('model', e.target.value)} />
        <input placeholder="Type e.g. SUV, Luxury Sedan" value={vehicleForm.vehicle_type} onChange={(e)=>update('vehicle_type', e.target.value)} />
        <input placeholder="Plate Number" value={vehicleForm.plate_number} onChange={(e)=>update('plate_number', e.target.value)} />
        <input placeholder="VIN" value={vehicleForm.vin} onChange={(e)=>update('vin', e.target.value)} />
        <input type="number" step="0.01" placeholder="Daily Rate" value={vehicleForm.daily_rate} onChange={(e)=>update('daily_rate', e.target.value)} />
        <input type="number" step="0.01" placeholder="Security Deposit" value={vehicleForm.security_deposit} onChange={(e)=>update('security_deposit', e.target.value)} />
        <select value={vehicleForm.status} onChange={(e)=>update('status', e.target.value)}>{vehicleStatuses.map(s=><option key={s} value={s}>{prettyStatus(s)}</option>)}</select>
        <button className="primary-btn"><Plus size={17}/> Add Vehicle</button>
      </form>
    </Panel>
  </section>;
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

function Messages({ rentals, messages, selectedRental, setSelectedRentalId, replyText, setReplyText, sendReply }) {
  const threadMessages = selectedRental ? messages.filter((m) => m.rental_id === selectedRental.id || m.user_id === selectedRental.user_id) : [];
  return <section className="content-grid messages-grid">
    <Panel title="Threads" eyebrow="Client Support">
      {rentals.map((r) => <button className="thread-btn" key={r.id} onClick={()=>setSelectedRentalId(r.id)}><strong>{r.profiles?.full_name || 'Client'}</strong></button>)}
    </Panel>
    <Panel title={selectedRental?.profiles?.full_name || 'Select a client'} eyebrow="Message Center">
      <div className="message-box">
        {threadMessages.map((m) => <div key={m.id} className={m.sender_role === 'admin' ? 'message own' : 'message'}><strong>{m.sender_role === 'admin' ? 'Admin' : 'Client'}</strong><p>{m.message}</p><span>{new Date(m.created_at).toLocaleString()}</span></div>)}
      </div>
      <form className="support-form" onSubmit={sendReply}><input value={replyText} onChange={(e)=>setReplyText(e.target.value)} placeholder="Reply to customer..."/><button><Send size={16}/> Send</button></form>
    </Panel>
  </section>;
}

function MockReservation({ mockForm, setMockForm, profiles, vehicles, createMockReservation }) {
  const update = (k, v) => setMockForm({ ...mockForm, [k]: v });
  return <Panel title="Create Mock Reservation" eyebrow="Testing Mode">
    <p className="muted">Use this to test the dashboard without triggering Stripe payment. The rental will be marked as mock.</p>
    <form className="portal-form mock-form" onSubmit={createMockReservation}>
      <select value={mockForm.customerEmail} onChange={(e)=>update('customerEmail', e.target.value)} required><option value="">Choose customer</option>{profiles.map(p=><option key={p.id} value={p.email || p.full_name}>{p.full_name || p.email || p.id}</option>)}</select>
      <select value={mockForm.vehicleId} onChange={(e)=>update('vehicleId', e.target.value)} required><option value="">Choose vehicle</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.name} — {money(v.daily_rate)}/day</option>)}</select>
      <input type="date" value={mockForm.pickupDate} onChange={(e)=>update('pickupDate', e.target.value)} required />
      <input type="date" value={mockForm.returnDate} onChange={(e)=>update('returnDate', e.target.value)} required />
      <select value={mockForm.pickupTime} onChange={(e)=>update('pickupTime', e.target.value)}>{timeOptions().map(t=><option key={t} value={t}>{t}</option>)}</select>
      <select value={mockForm.returnTime} onChange={(e)=>update('returnTime', e.target.value)}>{timeOptions().map(t=><option key={t} value={t}>{t}</option>)}</select>
      <button className="primary-btn"><Plus size={17}/> Create Mock Reservation</button>
    </form>
  </Panel>;
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
      <button onClick={()=>sendManualReminder(rental, 'SMS')}><MessageCircle size={15}/> SMS</button>
      <button onClick={()=>sendManualReminder(rental, 'Email')}><Mail size={15}/> Email</button>
    </div>
  </div>;
}

function RentalRow({ rental, updateRentalStatus, completeRentalReturn, recordTestPayment, recordExtensionPayment, extensionRequests = [], vehicles = [], reports = [], decideExtension, sendManualReminder, detailed, rentalDocuments = [], allDocuments = [], openDocument, markDocument, deleteDocument }) {
  const [returnPanelOpen, setReturnPanelOpen] = useState(false);
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
  const canMarkActive = releaseChecklist.ready && !['active', 'overdue', 'return_initiated', 'completed', 'cancelled'].includes(rental.status);
  const canOverrideWorkflow = !['active', 'overdue', 'return_initiated', 'completed', 'cancelled'].includes(rental.status) && releaseChecklist.vehicle;
  const missingRequirements = getMissingReleaseRequirements(releaseChecklist);
  const canOverrideReady = canOverrideWorkflow && !releaseChecklist.ready;
  const canOverrideActive = canOverrideWorkflow && !releaseChecklist.ready;
  const canCancel = ['pending', 'documents_needed', 'document_review', 'ready_for_pickup', 'approved'].includes(rental.status);
  const progressSteps = getRentalProgressSteps(rental, documentsForProgress);
  const rentalExtensions = extensionRequests.filter((request) => request.rental_id === rental.id || request.rentals?.id === rental.id);
  const rentalReports = reports.filter((report) => report.rental_id === rental.id || report.rentals?.id === rental.id);
  const adminState = getAdminRentalState(rental, releaseChecklist);

  return <div className="data-row rental-row">
    <div className="rental-row-main">
      <strong>{rental.vehicles?.name || 'Vehicle'}</strong>
      <span>{rental.profiles?.full_name || 'Client'} • {formatRentalDate(rental.pickup_date, rental.pickup_time)} → {formatRentalDate(rental.return_date, rental.return_time)}</span>
      {detailed && <small>{money(rental.rental_total)} rental • {money(rental.tax_amount)} tax • {money(rental.security_deposit)} deposit {rental.is_mock ? '• MOCK' : ''}</small>}
      {detailed && <MileageSummary rental={rental} />}
      <RentalProgressTracker steps={progressSteps} />
      {detailed && <div className="rental-doc-summary">
        <DocumentStatusBadge label="License" document={license} />
        <DocumentStatusBadge label="Insurance" document={insurance} />
      </div>}
      {detailed && <DocumentMiniList documents={documentsForDisplay} openDocument={openDocument} markDocument={markDocument} deleteDocument={deleteDocument} />}
      {detailed && <RentalExtensionActions requests={rentalExtensions} vehicles={vehicles} decideExtension={decideExtension} recordExtensionPayment={recordExtensionPayment} />}
      {detailed && rentalReports.length > 0 && <DamageReportList reports={rentalReports} />}
      {returnPanelOpen && <ReturnCompletionPanel rental={rental} onCancel={() => setReturnPanelOpen(false)} onComplete={(inspection) => completeRentalReturn(rental, inspection)} />}
    </div>
    <div className="row-actions">
      <span className={`workflow-badge ${adminState.tone}`}>{adminState.label}</span>
      {recordTestPayment && rental.payment_status !== 'paid' && <button className="approve" onClick={()=>recordTestPayment(rental.id)}><CreditCard size={15}/> Record Local Payment</button>}
      {canMarkActive && <button className="approve primary-action" onClick={()=>updateRentalStatus(rental.id, 'active')}><Car size={15}/> Mark Vehicle Picked Up</button>}
      {canOverrideReady && <button className="override-action" onClick={() => confirmRentalOverride('ready_for_pickup', rental, missingRequirements) && updateRentalStatus(rental.id, 'ready_for_pickup', { overrideMissingRequirements: true, missingRequirements })}><ShieldCheck size={15}/> Override Ready</button>}
      {canOverrideActive && <button className="override-action" onClick={() => confirmRentalOverride('active', rental, missingRequirements) && updateRentalStatus(rental.id, 'active', { overrideMissingRequirements: true, missingRequirements })}><Car size={15}/> Override Pickup</button>}
      {canCompleteReturn && <button className="approve primary-action" onClick={()=>setReturnPanelOpen(true)}><CheckCircle2 size={15}/> Confirm Return Complete</button>}
      {canCancel && <button className="reject" onClick={()=>updateRentalStatus(rental.id, 'cancelled')}><XCircle size={15}/> Cancel</button>}
      <button onClick={()=>sendManualReminder(rental, 'SMS')}><MessageCircle size={15}/> SMS</button>
      <button onClick={()=>sendManualReminder(rental, 'Email')}><Mail size={15}/> Email</button>
      {!canMarkActive && !canCompleteReturn && <small className="next-action-hint">{adminState.next}</small>}
    </div>
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

function RentalExtensionActions({ requests = [], vehicles = [], decideExtension, recordExtensionPayment }) {
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
          {request.customer_note && <small>Note: {request.customer_note}</small>}
        </div>
        <div className="mini-actions">
          {request.status === 'pending' && decideExtension && <button type="button" className="approve" onClick={() => decideExtension(request.id, true)}><CheckCircle2 size={14}/> Approve</button>}
          {request.status === 'pending' && decideExtension && <button type="button" className="reject" onClick={() => decideExtension(request.id, false)}><XCircle size={14}/> Reject</button>}
          {request.status === 'approved_pending_payment' && recordExtensionPayment && <button type="button" className="approve" onClick={() => recordExtensionPayment(request.id)}><CreditCard size={14}/> Record Payment</button>}
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
        <textarea value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="Damage description" />
        <textarea value={form.admin_notes} onChange={(event) => update('admin_notes', event.target.value)} placeholder="Admin notes, estimate details, customer communication..." />
        <input type="number" step="0.01" value={form.estimated_cost} onChange={(event) => update('estimated_cost', event.target.value)} placeholder="Estimated cost" />
        <input type="number" step="0.01" value={form.final_charge_amount} onChange={(event) => update('final_charge_amount', event.target.value)} placeholder="Final charge" />
        <input type="number" step="0.01" value={form.deposit_held_amount} onChange={(event) => update('deposit_held_amount', event.target.value)} placeholder="Deposit held" />
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
    skipChecklist: false,
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
    setSaving(true);
    await onComplete(inspection);
    setSaving(false);
  }

  const update = (key, value) => setInspection((current) => ({ ...current, [key]: value }));

  return <form className="return-completion-panel" onSubmit={submit}>
    <div>
      <strong>Return Completion</strong>
      <span>{rental.vehicles?.name || 'Vehicle'} • {rental.profiles?.full_name || 'Client'}</span>
    </div>
    <label className="field-label">Ending mileage
      <input type="number" min={rental.starting_mileage || 0} step="1" value={inspection.endingMileage} onChange={(event) => setInspection((current) => ({ ...current, endingMileage: event.target.value, mileageChecked: true }))} required />
    </label>
    {mileageError && <small className="form-error">{mileageError}</small>}
    {rental.starting_mileage !== null && rental.starting_mileage !== undefined && <small>Pickup mileage: {formatMiles(rental.starting_mileage)} • Miles driven: {formatMiles(milesDriven)}</small>}
    <label><input type="checkbox" checked={inspection.skipChecklist} onChange={(event) => update('skipChecklist', event.target.checked)} /> Skip checklist and close rental</label>
    {!inspection.skipChecklist && <>
      <label><input type="checkbox" checked={inspection.mileageChecked} onChange={(event) => update('mileageChecked', event.target.checked)} /> Mileage checked</label>
      <label><input type="checkbox" checked={inspection.fuelChecked} onChange={(event) => update('fuelChecked', event.target.checked)} /> Fuel checked</label>
      <label><input type="checkbox" checked={inspection.damageChecked} onChange={(event) => update('damageChecked', event.target.checked)} /> Damage checked</label>
      <label className="field-label">Deposit decision
        <select value={inspection.depositDecision} onChange={(event) => update('depositDecision', event.target.value)}>
          <option value="release">Release deposit after normal review</option>
          <option value="hold">Hold deposit for review</option>
        </select>
      </label>
      <label><input type="checkbox" checked={inspection.damageFound} onChange={(event) => setInspection((current) => ({ ...current, damageFound: event.target.checked, depositDecision: event.target.checked ? 'hold' : current.depositDecision }))} /> Damage or incident found</label>
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
        <textarea value={inspection.damageNote} onChange={(event) => update('damageNote', event.target.value)} placeholder="Describe damage, incident, mileage/fuel issue, cleaning issue, or deposit reason..." />
        <input type="file" multiple accept="image/*,application/pdf" onChange={(event) => update('files', Array.from(event.target.files || []))} />
      </>}
    </>}
    <div className="mini-actions">
      <button type="button" onClick={onCancel}>Cancel</button>
      <button type="submit" className="approve" disabled={saving}><CheckCircle2 size={14}/> {saving ? 'Closing...' : 'Close Rental'}</button>
    </div>
  </form>;
}

function RentalProgressTracker({ steps }) {
  return <div className="rental-progress-tracker" aria-label="Rental progress">
    {steps.map((step, index) => (
      <div className="progress-step-wrap" key={step.key}>
        <div className={`progress-step ${step.state}`} title={`${step.label}: ${step.detail}`}>
          {step.complete ? <CheckCircle2 size={14} /> : index + 1}
        </div>
        <span>{step.label}</span>
      </div>
    ))}
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
function Login({ authForm, setAuthForm, handleLogin, authMessage }) { return <div className="auth-screen"><div className="auth-left"><p className="eyebrow">Rent Me CT Admin</p><h1>Control the fleet, rentals, documents, deposits, and clients.</h1><p>Sign in with your approved admin email to manage reservations, cars out, document reviews, messages, mock reservations, and revenue.</p></div><form className="auth-card" onSubmit={handleLogin}><h2>Admin Login</h2><input type="email" placeholder="Admin email" value={authForm.email} onChange={(e)=>setAuthForm({...authForm, email:e.target.value})} required/><input type="password" placeholder="Password" value={authForm.password} onChange={(e)=>setAuthForm({...authForm, password:e.target.value})} required/><button className="primary-btn">Sign In</button>{authMessage && <p className="auth-message">{authMessage}</p>}</form></div>; }
function NotAdmin({ email, signOut }) { return <div className="auth-screen"><div className="auth-card"><h2>Not Authorized</h2><p className="muted">{email} is signed in, but this account does not have admin access.</p><button className="primary-btn" onClick={signOut}>Log Out</button></div></div>; }
function Notice({ notice, onDismiss }) { return <div className={`notice-banner ${notice.type || 'info'}`}><span>{notice.text}</span><button type="button" onClick={onDismiss}>Dismiss</button></div>; }

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

  const blockedUntil = new Date(bookedEnd.getTime() + TURNAROUND_BUFFER_MINUTES * 60 * 1000);
  return requestedStart < blockedUntil && requestedEnd > bookedStart;
}
function getRentalBlockedUntil(rental) {
  const bookedEnd = parseRentMeCtDateTime(rental?.return_date, rental?.return_time);
  if (!bookedEnd) return null;
  return new Date(bookedEnd.getTime() + TURNAROUND_BUFFER_MINUTES * 60 * 1000);
}
function rentalBlocksCalendarDay(rental, dayStart, dayEnd) {
  const bookedStart = parseRentMeCtDateTime(rental?.pickup_date, rental?.pickup_time);
  const blockedUntil = getRentalBlockedUntil(rental);
  if (!bookedStart || !blockedUntil) return false;
  return dayStart < blockedUntil && dayEnd > bookedStart;
}
function calendarBlockLabel(rental, dayIso) {
  if (dayIso === rental.pickup_date && dayIso === rental.return_date) {
    return `Booked ${rental.pickup_time || '9:00 AM'} - buffer until ${formatTimeOnly(getRentalBlockedUntil(rental))}`;
  }
  if (dayIso === rental.pickup_date) return `From ${rental.pickup_time || '9:00 AM'}`;
  if (dayIso === rental.return_date) return `Buffer until ${formatTimeOnly(getRentalBlockedUntil(rental))}`;
  return 'Booked';
}
function calendarCellClass({ unavailable, vehicleBlocked, rental, dayIso }) {
  if (!unavailable) return 'calendar-cell open';
  if (vehicleBlocked) return 'calendar-cell maintenance';
  if (rental && dayIso === rental.return_date) return 'calendar-cell buffer';
  return 'calendar-cell booked';
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
    return { iso, label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
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

    if (isOverdue(rental.return_date, rental.status)) {
      items.push({ id: `overdue-${rental.id}`, bucket: 'return_attention', severity: 'critical', title: 'Rental overdue', subtitle: `${customer} • ${vehicle}`, detail: `Return was due ${formatRentalDate(rental.return_date, rental.return_time)}`, rental, nextStatus: 'overdue' });
    } else if (isDueSoon(rental.return_date)) {
      items.push({ id: `due-${rental.id}`, bucket: 'return_attention', severity: 'warning', title: 'Return due soon', subtitle: `${customer} • ${vehicle}`, detail: `Due ${formatRentalDate(rental.return_date, rental.return_time)}`, rental });
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
    if ((rental.payment_status || 'pending') !== 'paid' && ['pending', 'documents_needed', 'document_review', 'approved'].includes(rental.status)) {
      items.push({ id: `payment-${rental.id}`, bucket: 'payment_needed', severity: 'warning', title: 'Payment pending', subtitle: `${customer} • ${vehicle}`, detail: `Payment status: ${prettyStatus(rental.payment_status || 'pending')}`, rental, localPaymentAction: true });
    }
    const phoneVerified = Boolean(rental.profiles?.phone_verified || rental.profiles?.phone_verified_at);
    if (['document_review', 'approved', 'ready_for_pickup'].includes(rental.status) && phoneVerified && rental.agreement_signed && paymentPaid && releaseDocsApproved) {
      items.push({ id: `pickup-${rental.id}`, bucket: 'pickup_today', severity: 'info', title: 'Release ready', subtitle: `${customer} • ${vehicle}`, detail: `Approved documents. Pickup ${formatRentalDate(rental.pickup_date, rental.pickup_time)}`, rental, nextStatus: 'active' });
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
  const hasDatesAndVehicle = Boolean(rental.vehicle_id && rental.pickup_date && rental.return_date);
  const agreementSigned = Boolean(rental.agreement_signed);
  const paymentPaid = (rental.payment_status || 'pending') === 'paid';
  const readyForPickup = rental.status === 'ready_for_pickup' || (
    phoneVerified &&
    hasDatesAndVehicle &&
    agreementSigned &&
    paymentPaid &&
    hasLicense &&
    hasInsurance
  );

  const steps = [
    { key: 'phone', label: 'Phone', complete: phoneVerified, detail: phoneVerified ? 'Phone verified' : 'Phone verification needed' },
    { key: 'vehicle', label: 'Vehicle', complete: hasDatesAndVehicle, detail: hasDatesAndVehicle ? 'Dates and vehicle selected' : 'Dates or vehicle missing' },
    { key: 'agreement', label: 'Agreement', complete: agreementSigned, detail: agreementSigned ? 'Agreement signed' : 'Agreement not signed' },
    { key: 'payment', label: 'Payment', complete: paymentPaid, detail: paymentPaid ? 'Payment complete' : `Payment ${prettyStatus(rental.payment_status || 'pending')}` },
    { key: 'license', label: 'License', complete: hasLicense, detail: hasLicense ? `Driver license ${prettyStatus(license.status)}` : 'Driver license missing' },
    { key: 'insurance', label: 'Insurance', complete: hasInsurance, detail: hasInsurance ? `Insurance ${prettyStatus(insurance.status)}` : 'Insurance missing' },
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
    vehicle: Boolean(rental.vehicle_id && rental.pickup_date && rental.return_date),
    agreement: Boolean(rental.agreement_signed),
    payment: (rental.payment_status || 'pending') === 'paid',
    license: license?.status === 'approved',
    insurance: insurance?.status === 'approved',
    ready: Boolean(
      (rental.profiles?.phone_verified || rental.profiles?.phone_verified_at) &&
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
    !releaseChecklist.agreement ? 'signed agreement' : '',
    !releaseChecklist.payment ? 'payment' : '',
    !releaseChecklist.license ? 'driver license' : '',
    !releaseChecklist.insurance ? 'insurance' : '',
  ].filter(Boolean);
}

function confirmRentalOverride(nextStatus, rental, missingRequirements = []) {
  const actionLabel = nextStatus === 'active' ? 'mark this vehicle picked up' : 'mark this rental ready for pickup';
  const customer = rental.profiles?.full_name || 'this customer';
  const vehicle = rental.vehicles?.name || 'this vehicle';
  const missingText = missingRequirements.length
    ? missingRequirements.map((requirement) => `- ${requirement}`).join('\n')
    : '- automatic checklist incomplete';

  return window.confirm([
    `Override automatic rental workflow and ${actionLabel}?`,
    '',
    `${customer} / ${vehicle}`,
    '',
    'The following required step(s) are incomplete:',
    missingText,
    '',
    'This will be recorded in the audit log.',
  ].join('\n'));
}

function getAdminRentalState(rental, releaseChecklist) {
  if (rental.status === 'completed') return { label: 'Completed', tone: 'success', next: 'This rental is closed.' };
  if (rental.status === 'cancelled') return { label: 'Cancelled', tone: 'danger', next: 'This rental is cancelled.' };
  if (rental.status === 'return_initiated') return { label: 'Return Pending', tone: 'danger', next: 'Inspect the car, then confirm return complete.' };
  if (rental.status === 'overdue') return { label: 'Overdue', tone: 'danger', next: 'Contact customer or wait for return confirmation.' };
  if (rental.status === 'active') return { label: 'Car Out', tone: 'info', next: 'Customer has the vehicle. Watch return and extension requests.' };
  if (releaseChecklist.ready) return { label: 'Ready For Pickup', tone: 'success', next: 'Mark vehicle picked up when the customer gets the keys.' };
  if (!releaseChecklist.payment) return { label: 'Payment Needed', tone: 'warning', next: 'Record payment or wait for online payment.' };
  if (!releaseChecklist.agreement) return { label: 'Agreement Needed', tone: 'warning', next: 'Customer needs to sign the rental agreement.' };
  if (!releaseChecklist.license || !releaseChecklist.insurance) return { label: 'Documents Needed', tone: 'warning', next: 'Approve license and insurance before pickup.' };
  if (!releaseChecklist.phone) return { label: 'Phone Needed', tone: 'warning', next: 'Customer needs phone verification.' };
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
function tabTitle(tab) { return ({ dashboard:'Dashboard', queue:'Operations Queue', calendar:'Fleet Calendar', rentals:'Rental Manager', customers:'Customers', vehicles:'Fleet Manager', documents:'Document Review', messages:'Messages', mock:'Mock Reservations' })[tab] || 'Admin Portal'; }
function money(value) { return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' }); }
function getRentalDays(start, end) { const a = new Date(`${start}T00:00:00`); const b = new Date(`${end}T00:00:00`); return Math.ceil((b - a) / (1000*60*60*24)); }
function formatRentalDate(date, time) { if (!date) return 'Pending'; return `${new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}${time ? ` ${time}` : ''}`; }
function isThisMonth(date) { if (!date) return false; const d = new Date(date); const n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); }
function isOverdue(returnDate, status) { if (!returnDate || ['completed','cancelled'].includes(status)) return false; return new Date(`${returnDate}T23:59:59`) < new Date(); }
function isDueSoon(returnDate) { if (!returnDate) return false; const due = new Date(`${returnDate}T23:59:59`); const now = new Date(); const hours = (due - now) / 36e5; return hours > 0 && hours <= 30; }
function isToday(date) { if (!date) return false; const due = new Date(`${date}T00:00:00`); const now = new Date(); return due.getFullYear() === now.getFullYear() && due.getMonth() === now.getMonth() && due.getDate() === now.getDate(); }
function isPaidRental(rental) {
  const paymentStatus = String(rental?.payment_status || '').toLowerCase();
  const status = String(rental?.status || '').toLowerCase();

  return paymentStatus === 'paid' && status !== 'cancelled';
}
function prettyStatus(status) { return String(status || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function docLabel(type) { return type === 'license' ? 'Driver License' : type === 'insurance' ? 'Insurance Policy' : prettyStatus(type); }
function prettyVehicleStatus(status) { return prettyStatus(status || 'available'); }
function timeOptions() { const times=[]; for(let h=9; h<=21; h++){ const suffix=h>=12?'PM':'AM'; const dh=h>12?h-12:h; times.push(`${dh}:00 ${suffix}`); } return times; }

createRoot(document.getElementById('root')).render(<App />);
