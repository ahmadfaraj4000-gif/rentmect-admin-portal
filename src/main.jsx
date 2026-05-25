import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CalendarDays,
  Car,
  CheckCircle2,
  Clock,
  CreditCard,
  FileSignature,
  FileText,
  LogOut,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { supabase } from './supabaseClient';
import './styles.css';

const VEHICLE_IMAGE_MODULES = import.meta.glob([
  './assets/Audi*.png',
  './assets/Benz*.png',
  './assets/BMW*.png',
  './assets/Buick*.png',
  './assets/Cadillac*.png',
  './assets/Dodge*.png',
  './assets/Ford*.png',
  './assets/Kia*.png',
  './assets/Mercedes*.png',
], { eager: true, query: '?url', import: 'default' });

const RENTMECT_ADDRESS =
  import.meta.env.VITE_RENTMECT_ADDRESS || '12 Holmes Circle, Farmington, CT';

const CT_TAX_RATE = 0.0635;
const AGREEMENT_VERSION = 'rentmect-master-v2026-05-20';
const MILEAGE_POLICY = '200 miles/day included; excess mileage $0.35/mile';
const CANCELLATION_TERMS = 'Contact Rent Me CT before pickup for cancellation or schedule changes.';
const BLOCKING_RENTAL_STATUSES = ['pending', 'documents_needed', 'document_review', 'ready_for_pickup', 'approved', 'active', 'overdue', 'return_initiated'];
const BLOCKING_VEHICLE_STATUSES = ['reserved', 'rented', 'maintenance', 'unavailable', 'inactive'];
const TURNAROUND_BUFFER_MINUTES = 180;

const AGREEMENT_TEXT = `
RENT ME CT / ANCONA ENTERPRISES, INC.
MASTER VEHICLE RENTAL AGREEMENT

This Master Vehicle Rental Agreement ("Agreement") is entered into by and between Rent Me CT / Ancona Enterprises, Inc., a Connecticut corporation ("Company"), and the undersigned renter ("Renter"). This Agreement governs all rentals of motor vehicles by Renter from Company.

VEHICLE DESCRIPTION AND CONDITION
The vehicle subject to this Agreement ("Vehicle") shall be identified in the Rental Addendum executed at the time of rental, including make, model, year, VIN, license plate number, and odometer reading.

Said documentation is incorporated herein by reference.

Renter acknowledges receipt of the Vehicle in good working order except as noted in the Vehicle Condition Report and agrees to return the Vehicle in the same condition, ordinary wear and tear excepted.

RENTAL TERM
The Rental Period shall begin and end on the dates and times specified in the Rental Addendum.

Same-day rentals are permitted subject to identity and license verification approval by Company.

Failure to return the Vehicle at the agreed time may result in additional rental charges and may constitute unlawful retention of the Vehicle.

DRIVER QUALIFICATIONS
Renter must be at least twenty-one (21) years of age and possess a valid, unexpired driver’s license.

Renters under the age of twenty-five (25) shall be subject to a Young Driver Fee.

Only drivers listed in the Rental Addendum and approved by Company may operate the Vehicle.

Operation by an unauthorized driver constitutes a material breach.

PAYMENT TERMS AND MILEAGE
Mileage: Two hundred (200) miles per day are included.

Excess mileage shall be charged at $0.35 per mile.

Unlimited mileage may be purchased for an additional fee depending upon vehicle class.

Security deposits and post-rental charges may range from $200 to $2,000 depending upon vehicle class, extent of damage, policy violations, cleaning requirements, and other contractual breaches.

Renter authorizes Company to charge any payment method on file for all authorized charges including rental fees, excess mileage, tolls, traffic violations, cleaning fees, smoking fees, damage, loss of use, diminished value, towing, storage, repossession, administrative fees, and attorneys’ fees.

Renter also authorizes Company to charge fuel charges, transportation fees, recovery fees, and all other authorized charges related to the rental.

PICK-UP AND DROP-OFF SERVICES
Company may offer vehicle pick-up and drop-off services subject to availability, scheduling, and Company approval at its sole discretion.

For locations within fifteen (15) miles of Company's designated pickup location, a $30 fee shall apply for vehicle pick-up service.

If Renter requests return drop-off transportation, an additional $30 fee shall apply.

If both services are requested, the total transportation charge shall be $60.

Company reserves the right to approve, deny, modify, or reschedule any transportation-related request at its sole discretion.

Additional charges may apply for locations exceeding fifteen (15) miles, airport coordination, after-hours requests, tolls, traffic conditions, or special accommodations.

FUEL POLICY
Renter agrees to return the Vehicle with the same fuel level provided at the commencement of the Rental Period.

Vehicles must be refueled using the fuel type and octane rating recommended by the Vehicle manufacturer. Use of improper fuel or failure to follow manufacturer fuel guidelines may result in additional charges for damages, repairs, cleaning, diagnostics, towing, loss of use, and administrative expenses.

If the Vehicle is returned with less fuel than originally provided, Company may refuel the Vehicle at Renter's expense.

Renter shall be responsible for the actual fuel cost in addition to a $20 refueling service fee.

Failure to maintain proper fuel levels may result in additional administrative or service charges where applicable.

VEHICLE RECOVERY AND RETRIEVAL AMENDMENT
In the event the Vehicle requires recovery, retrieval, repossession, improper return pickup, abandoned vehicle transport, or transportation from an unauthorized location, Renter agrees to pay all associated costs incurred by Company.

Recovery and retrieval service charges shall begin at $80 and may increase depending upon distance, labor, tolls, storage, timing, vehicle condition, or other related circumstances.

Company reserves the right to charge the payment method on file for all recovery-related costs and administrative expenses associated with enforcement of this Agreement.

SPEED MONITORING AND VEHICLE DISABLING POLICY
Renter acknowledges that the Vehicle may be equipped with GPS tracking and telematics capable of monitoring vehicle speed and driving behavior.

No driver is permitted to operate the Vehicle at speeds exceeding ninety (90) miles per hour.

Repeated excessive speed violations may result in warnings issued by Company.

After the third warning for excessive speed or reckless driving behavior, Company reserves the right to remotely disable or shut down the Vehicle where legally permitted and reasonably safe to do so.

Renter agrees that a $100 vehicle reactivation fee shall apply before the Vehicle is re-enabled for continued use.

CLEANLINESS AND DETAILING POLICY
Renter agrees to return the Vehicle in reasonably clean condition, excluding ordinary wear and minor debris associated with normal use.

If the Vehicle is returned excessively dirty, stained, muddy, contains excessive trash, pet hair, strong odors, bodily fluids, sand, smoke residue, or otherwise requires abnormal cleaning or detailing beyond standard turnover preparation, Company reserves the right to charge an excessive cleaning fee of $80 or more depending upon the condition of the Vehicle and the extent of cleaning required.

PROHIBITED USES
The Vehicle shall not be used:

• by any unauthorized driver
• while under the influence of alcohol or drugs
• for racing or speed contests
• for towing or pushing another vehicle
• for rideshare or delivery services unless authorized
• for any illegal activity
• outside permitted geographic areas

Any such use constitutes a material breach and may void any damage waiver or liability limitation.

SMOKING POLICY
Smoking is strictly prohibited in the Vehicle.

Evidence of smoking, including odor, ash, or residue, shall result in a cleaning and remediation fee ranging from $200 to $2,000.

RENTER LIABILITY FOR DAMAGE
Renter is fully responsible for any and all damage to the Vehicle during the Rental Period regardless of fault.

Responsibility includes physical damage, mechanical damage caused by misuse, theft, vandalism, loss of use, diminished value, towing, storage, and administrative fees.

Company shall not be required to prove fleet utilization or actual lost bookings.

ACCIDENT AND DAMAGE REPORTING
Renter must immediately notify Company of any accident, collision, theft, or damage involving the Vehicle.

Renter shall cooperate with Company and law enforcement and file a police report when required.

Failure to promptly report may result in additional liability.

INSURANCE AND INDEMNIFICATION
Unless expressly provided in writing, Company does not provide primary insurance.

Renter represents that they maintain valid automobile insurance and agrees to indemnify and hold Company harmless.

OUT-OF-STATE TRAVEL POLICY
Out-of-state travel is:

[ ] Permitted
[ ] Prohibited

Unauthorized interstate travel constitutes material breach.

GPS AND TELEMATICS CONSENT
Renter acknowledges that the Vehicle may be equipped with GPS tracking for theft prevention, recovery, speed monitoring, and vehicle diagnostics.

TRAFFIC VIOLATIONS, PARKING CITATIONS, TOLLS
Renter shall be responsible for all violations, tickets, and toll charges incurred during the Rental Period.

Company may transfer liability or charge the Renter directly, including administrative fees.

ATTORNEYS’ FEES AND COLLECTION COSTS
Renter agrees to pay all reasonable costs incurred by Company in enforcing this Agreement, including attorneys’ fees, court costs, and collection expenses.

GOVERNING LAW AND VENUE
This Agreement shall be governed by the laws of the State of Connecticut.

Any disputes shall be brought exclusively in Connecticut Superior Court, Judicial District of New Britain.

ENTIRE AGREEMENT; SEVERABILITY
This Agreement constitutes the entire agreement between the Parties.

If any provision is deemed unenforceable, the remaining provisions shall remain in full force.

SIGNATURES

Renter’s Signature: ___________________________________________

Printed Name: _______________________________________________

Date: ___________________

Rent Me CT Representative: _____________________________________

Date: ___________________

RENT ME CT / ANCONA ENTERPRISES, INC.
RENTAL ADDENDUM

This Addendum is incorporated into and governed by the Master Vehicle Rental Agreement.

RENTER INFORMATION
Full Legal Name: _____________________________________________

Address: ____________________________________________________

City/State/Zip: ______________________________________________

Phone: ______________________________________________________

Email: ______________________________________________________

Driver’s License #: __________________ State: ____ Exp: ____

VEHICLE INFORMATION
Make: ______________________

Model: _____________________

Year: ______________________

VIN: _______________________

License Plate: ______________

Odometer Out: ______________

RENTAL TERM
Rental Start Date: __________ Time: ________

Rental End Date: __________ Time: ________

Return Location: ____________________________________________

PRICING & FEES
Daily Rate: $_________

Young Driver Fee: $_________

Unlimited Mileage: [ ] YES [ ] NO

Unlimited Mileage Fee: $_________

Mileage Included: 200 miles/day

Excess Mileage: $0.35 per mile

Security Deposit: $_________

Pick-Up / Drop-Off Fee (if applicable): $_________

OUT-OF-STATE TRAVEL
[ ] Permitted
[ ] Prohibited

ADDITIONAL AUTHORIZED DRIVERS
Name: ________________________ License #: ___________________

Name: ________________________ License #: ___________________

ACKNOWLEDGMENT
Renter acknowledges and agrees to all terms of the Master Agreement.

Renter Signature: __________________________ Date: __________

Company Representative: ____________________ Date: __________
`;

function App() {
  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState('sign-in');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState(null);
  const [reservationSaving, setReservationSaving] = useState(false);
  const [agreementSaving, setAgreementSaving] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [returnSaving, setReturnSaving] = useState(false);
  const [extensionSaving, setExtensionSaving] = useState(false);
  const [extensionPreview, setExtensionPreview] = useState(null);
  const [extensionMode, setExtensionMode] = useState('extend');
  const [portalDataReady, setPortalDataReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [authForm, setAuthForm] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
    address: '',
    billingSame: true,
  });

  const [profile, setProfile] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [fleetRentals, setFleetRentals] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [extensionRequests, setExtensionRequests] = useState([]);
  const [supportText, setSupportText] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [agreementModalOpen, setAgreementModalOpen] = useState(false);

  const [reservationForm, setReservationForm] = useState({
    vehicleId: '',
    pickupDate: getTodayDateInputValue(),
    returnDate: getNextDateInputValue(getTodayDateInputValue()),
    pickupTime: '9:00 AM',
    returnTime: '9:00 AM',
  });
  const [extensionForm, setExtensionForm] = useState({
    returnDate: '',
    returnTime: '9:00 AM',
    note: '',
  });

  const [pendingVehicleName, setPendingVehicleName] = useState('');
  const [pendingVehicleId, setPendingVehicleId] = useState('');
  const [pendingBookingId, setPendingBookingId] = useState('');
  const [checkoutIntent, setCheckoutIntent] = useState(false);
  const [checkoutWizardStarted, setCheckoutWizardStarted] = useState(false);

  const [profileForm, setProfileForm] = useState({
    full_name: '',
    phone: '',
    address: '',
  });

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneCode, setPhoneCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [signatureName, setSignatureName] = useState('');

  function notify(text, type = 'info') {
    setNotice({ text, type });
    window.clearTimeout(notify.timeout);
    notify.timeout = window.setTimeout(() => setNotice(null), 5200);
  }

  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      setSession(data.session);
      const metaBooking = data.session?.user?.user_metadata?.pending_booking;

      if (metaBooking) {
        localStorage.setItem('rentmect_pending_booking', JSON.stringify(metaBooking));
      }

      const bookingId = getBookingIdFromUrl();
      if (bookingId) {
        setPendingBookingId(bookingId);
        await loadPendingBookingFromDatabase(bookingId, data.session);
      } else {
        loadSavedBookingFromWebsite();
      }

      const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
      });

      setLoading(false);

      return () => listener?.subscription?.unsubscribe?.();
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (session?.user?.id) {
      setPortalDataReady(false);
      loadPortalData(session.user.id);
    }
  }, [session]);

  useEffect(() => {
    if (!session?.user?.id || !pendingBookingId) return;

    async function attachPendingBookingToUser() {
      const { error } = await supabase.rpc('claim_customer_pending_booking', {
        p_booking_id: pendingBookingId,
        p_customer_phone: profileForm.phone || null,
        p_vehicle_id: pendingVehicleId || reservationForm.vehicleId || null,
      });

      if (error) {
        notify(error.message || 'Could not attach pending booking to your account.');
      }
    }

    attachPendingBookingToUser();
  }, [session, pendingBookingId, pendingVehicleId, reservationForm.vehicleId, profileForm.phone]);

  useEffect(() => {
    if (profile?.full_name && !signatureName) {
      setSignatureName(profile.full_name);
    }
  }, [profile, signatureName]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (pendingVehicleId && vehicles.some((vehicle) => vehicle.id === pendingVehicleId) && reservationForm.vehicleId !== pendingVehicleId) {
      setReservationForm((prev) => ({
        ...prev,
        vehicleId: pendingVehicleId,
      }));
      return;
    }

    if (!pendingVehicleName || vehicles.length === 0 || reservationForm.vehicleId) return;

    const matchedVehicle = vehicles.find((vehicle) =>
      normalizeVehicleName(vehicle.name) === normalizeVehicleName(pendingVehicleName) &&
      isVehicleAvailableForDates(vehicle, reservationForm, fleetRentals)
    );

    if (matchedVehicle) {
      setReservationForm((prev) => ({
        ...prev,
        vehicleId: matchedVehicle.id,
      }));
    }
  }, [pendingVehicleId, pendingVehicleName, vehicles, reservationForm, fleetRentals]);

  const currentRental = useMemo(() => {
    const blockingRentals = rentals.filter((r) => BLOCKING_RENTAL_STATUSES.includes(r.status));
    const priority = (status) => {
      if (['active', 'overdue', 'return_initiated'].includes(status)) return 0;
      if (['ready_for_pickup', 'approved'].includes(status)) return 1;
      return 2;
    };
    return [...blockingRentals].sort((a, b) => priority(a.status) - priority(b.status))[0];
  }, [rentals]);

  useEffect(() => {
    if (!currentRental?.id) return;

    setReservationForm((prev) => ({
      ...prev,
      vehicleId: currentRental.vehicle_id || prev.vehicleId,
      pickupDate: currentRental.pickup_date || prev.pickupDate,
      returnDate: currentRental.return_date || prev.returnDate,
      pickupTime: currentRental.pickup_time || prev.pickupTime,
      returnTime: currentRental.return_time || prev.returnTime,
    }));
  }, [
    currentRental?.id,
    currentRental?.vehicle_id,
    currentRental?.pickup_date,
    currentRental?.return_date,
    currentRental?.pickup_time,
    currentRental?.return_time,
  ]);

  useEffect(() => {
    if (!session?.user?.id || !portalDataReady || !checkoutIntent || checkoutWizardStarted) return;
    if (pendingVehicleName && vehicles.length === 0) return;
    if (currentRental) {
      setCheckoutWizardStarted(true);
      return;
    }
    // If the originally selected website vehicle is no longer available, still open the wizard so the customer can choose another car.

    setActiveTab('overview');
    setWizardStep(phoneVerified ? 1 : 0);
    setWizardOpen(true);
    setCheckoutWizardStarted(true);
  }, [session, portalDataReady, checkoutIntent, checkoutWizardStarted, pendingVehicleName, vehicles.length, reservationForm.vehicleId, currentRental, phoneVerified]);

  const previousRentals = useMemo(() => {
    return rentals.filter((r) => ['completed', 'cancelled'].includes(r.status));
  }, [rentals]);

  const selectedVehicle = useMemo(() => {
    return vehicles.find((v) => v.id === reservationForm.vehicleId);
  }, [vehicles, reservationForm.vehicleId]);

  const displayedVehicle = currentRental?.vehicles || selectedVehicle;
  const overviewPickupDate = currentRental?.pickup_date || reservationForm.pickupDate;
  const overviewPickupTime = currentRental?.pickup_time || reservationForm.pickupTime;
  const overviewReturnDate = currentRental?.return_date || reservationForm.returnDate;
  const overviewReturnTime = currentRental?.return_time || reservationForm.returnTime;

  const availableVehicles = useMemo(() => {
    return vehicles.filter((vehicle) => isVehicleAvailableForDates(vehicle, reservationForm, fleetRentals, currentRental?.id));
  }, [vehicles, reservationForm, fleetRentals, currentRental?.id]);

  const estimate = useMemo(() => {
    if (!selectedVehicle || !reservationForm.pickupDate || !reservationForm.returnDate) {
      return null;
    }

    const days = getRentalDays(reservationForm.pickupDate, reservationForm.returnDate);
    if (days < 1) return { invalid: true, days };

    const rentalTotal = Number(selectedVehicle.daily_rate || 0) * days;
    const taxAmount = rentalTotal * CT_TAX_RATE;
    const securityDeposit = Number(selectedVehicle.security_deposit || 0);

    return {
      days,
      rentalTotal,
      taxAmount,
      securityDeposit,
      checkoutTotal: rentalTotal + taxAmount,
    };
  }, [selectedVehicle, reservationForm]);

  const userEmail = session?.user?.email || '';
  const userName =
    profile?.full_name ||
    session?.user?.user_metadata?.full_name ||
    userEmail ||
    'Rent Me CT Customer';

  const currentRentalDocuments = useMemo(() => {
    if (!currentRental?.id) return [];
    return documents.filter((document) => document.rental_id === currentRental.id);
  }, [documents, currentRental?.id]);
  const reusableLicenseDocument = useMemo(() => latestDocument(documents, 'license'), [documents]);
  const currentInsuranceDocument = useMemo(() => latestDocument(currentRentalDocuments, 'insurance'), [currentRentalDocuments]);
  const currentRentalLicenseDocument = useMemo(() => latestDocument(currentRentalDocuments, 'license'), [currentRentalDocuments]);
  const documentsForActiveRental = useMemo(() => {
    if (!reusableLicenseDocument || currentRentalLicenseDocument?.id === reusableLicenseDocument.id) {
      return currentRentalDocuments;
    }

    return [reusableLicenseDocument, ...currentRentalDocuments];
  }, [currentRentalDocuments, currentRentalLicenseDocument?.id, reusableLicenseDocument]);
  const currentRentalExtensions = useMemo(() => {
    if (!currentRental?.id) return [];
    return extensionRequests.filter((request) => request.rental_id === currentRental.id);
  }, [extensionRequests, currentRental?.id]);
  const pendingExtension = currentRentalExtensions.find((request) => request.status === 'pending');
  const pendingSameVehicleExtension = pendingExtension?.request_kind !== 'switch_car_continuation' ? pendingExtension : null;
  const approvedUnpaidExtension = currentRentalExtensions.find((request) => request.status === 'approved_pending_payment');
  const approvedSwitchExtension = currentRentalExtensions.find((request) =>
    request.status === 'approved_pending_payment' &&
    request.request_kind === 'switch_car_continuation'
  );
  const approvedSwitchVehicle = vehicles.find((vehicle) => vehicle.id === approvedSwitchExtension?.replacement_vehicle_id);
  const activatedExtension = currentRentalExtensions.find((request) => request.status === 'activated');
  const latestExtensionStatus = [...currentRentalExtensions]
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))[0];
  const paidSwitchContinuation = extensionRequests.find((request) =>
    request.status === 'activated' &&
    request.request_kind === 'switch_car_continuation' &&
    request.replacement_rental_id
  );
  const switchContinuationRental = rentals.find((rental) => rental.id === paidSwitchContinuation?.replacement_rental_id);

  const licenseRejected = reusableLicenseDocument?.status === 'rejected';
  const insuranceRejected = currentInsuranceDocument?.status === 'rejected';
  const licenseUploaded = isUsableDocument(reusableLicenseDocument);
  const insuranceUploaded = isUsableDocument(currentInsuranceDocument);
  const documentsRejected = licenseRejected || insuranceRejected;
  const missingRequiredDocuments = !licenseUploaded || !insuranceUploaded;
  const hasCompletedRental = previousRentals.some((rental) => rental.status === 'completed');
  const emailVerified = Boolean(session?.user?.email_confirmed_at);
  const agreementSigned = Boolean(currentRental?.agreement_signed);
  const paymentPaid = currentRental?.payment_status === 'paid';
  const returnCountdown = getReturnCountdown(currentRental?.return_date, currentRental?.return_time, now);
  const returnConfirmationSent = Boolean(
    currentRental?.status === 'return_initiated' ||
    messages.some((message) =>
      message.rental_id === currentRental?.id &&
      message.sender_role === 'client' &&
      String(message.message || '').includes('RETURN CONFIRMATION')
    )
  );
  const showApprovedSwitchVehicle = Boolean(returnConfirmationSent && approvedSwitchExtension && approvedSwitchVehicle);
  const mobileStatusItems = [
    currentRental
      ? {
        key: 'rental',
        tone: currentRental.status === 'return_initiated' ? 'success' : 'info',
        title: currentRental.status === 'return_initiated' ? 'Return confirmation sent' : prettyStatus(currentRental.status),
        text: currentRental.status === 'return_initiated'
          ? 'Rent Me CT has been notified. We will inspect the vehicle and close this rental.'
          : `Current vehicle: ${currentRental.vehicles?.name || 'Selected vehicle'}. Return ${formatRentalDate(currentRental.return_date, currentRental.return_time)}.`,
      }
      : {
        key: 'setup',
        tone: hasCompletedRental ? 'success' : 'info',
        title: hasCompletedRental ? 'Ready for your next rental' : 'Finish your reservation',
        text: hasCompletedRental
          ? 'Your license and phone can stay on file. Choose new dates and upload insurance for the next rental.'
          : 'Complete the next guided step. We will keep each action clear as you go.',
      },
    latestExtensionStatus
      ? {
        key: 'extension',
        tone: latestExtensionStatus.status === 'activated'
          ? 'success'
          : latestExtensionStatus.status === 'rejected'
            ? 'danger'
            : latestExtensionStatus.status === 'approved_pending_payment'
              ? 'warning'
              : 'info',
        title: extensionStatusTitle(latestExtensionStatus),
        text: extensionStatusText(latestExtensionStatus),
      }
      : null,
    showApprovedSwitchVehicle
      ? {
        key: 'replacement',
        tone: 'warning',
        title: `${approvedSwitchVehicle.name} approved next`,
        text: 'Return confirmation is in. Payment is still required before this replacement activates.',
      }
      : null,
  ].filter(Boolean);
  const extensionWindow = getExtensionRequestWindow(currentRental, now);
  const vehicleStepCompleted = Boolean(currentRental?.vehicles || (!currentRental && selectedVehicle));
  const allGuidedStepsComplete = Boolean(phoneVerified && vehicleStepCompleted && licenseUploaded && insuranceUploaded && agreementSigned && paymentPaid);
function getBookingIdFromUrl() {
    return new URLSearchParams(window.location.search).get('booking') || '';
  }

  function applyBookingDataToPortal(bookingData) {
    const today = getTodayDateInputValue();
    const rawPickupDate = bookingData.pickupDate || bookingData.pickup_date || '';
    const pickupDate = !rawPickupDate || rawPickupDate < today ? today : rawPickupDate;
    const rawReturnDate = bookingData.returnDate || bookingData.return_date || '';
    const minReturnDate = getNextDateInputValue(pickupDate);
    const returnDate = !rawReturnDate || rawReturnDate < minReturnDate ? minReturnDate : rawReturnDate;

    const normalizedBooking = {
      pickupDate,
      returnDate,
      pickupTime: bookingData.pickupTime || bookingData.pickup_time || '9:00 AM',
      returnTime: bookingData.returnTime || bookingData.return_time || '9:00 AM',
      selectedVehicle:
        bookingData.selectedVehicle ||
        bookingData.selected_vehicle_name ||
        bookingData.vehicleName ||
        bookingData.vehicle_name ||
        '',
      selectedVehicleId:
        bookingData.selectedVehicleId ||
        bookingData.selected_vehicle_id ||
        bookingData.vehicleId ||
        bookingData.vehicle_id ||
        '',
    };

    const hasBookingData =
      normalizedBooking.pickupDate ||
      normalizedBooking.returnDate ||
      normalizedBooking.selectedVehicle ||
      normalizedBooking.selectedVehicleId;

    if (!hasBookingData) return;

    setCheckoutIntent(true);
    setAuthMode('sign-up');

    setReservationForm((prev) => ({
      ...prev,
      pickupDate: normalizedBooking.pickupDate || prev.pickupDate,
      returnDate: normalizedBooking.returnDate || prev.returnDate,
      pickupTime: normalizedBooking.pickupTime || prev.pickupTime,
      returnTime: normalizedBooking.returnTime || prev.returnTime,
    }));

    if (normalizedBooking.selectedVehicle) {
      setPendingVehicleName(normalizedBooking.selectedVehicle);
    }

    if (normalizedBooking.selectedVehicleId) {
      setPendingVehicleId(normalizedBooking.selectedVehicleId);
      setReservationForm((prev) => ({
        ...prev,
        vehicleId: normalizedBooking.selectedVehicleId,
      }));
    }

    localStorage.setItem('rentmect_pending_booking', JSON.stringify(normalizedBooking));
  }

  async function loadPendingBookingFromDatabase(bookingId, currentSession) {
    if (!bookingId) return;

    try {
      const { data, error } = await supabase.rpc('get_website_pending_booking', {
        p_booking_id: bookingId,
      });
      const pendingBooking = data?.[0];

      if (error) {
        notify(error.message || 'Could not load the saved booking.');
        loadSavedBookingFromWebsite();
        return;
      }

      if (!pendingBooking) return;

      applyBookingDataToPortal(pendingBooking);

      if (currentSession?.user?.id) {
        await supabase.rpc('claim_customer_pending_booking', {
          p_booking_id: bookingId,
          p_vehicle_id: pendingBooking.vehicle_id || pendingVehicleId || reservationForm.vehicleId || null,
        });
      }
    } catch (error) {
      notify(error.message || 'Failed to load pending booking.');
      loadSavedBookingFromWebsite();
    }
  }

function loadSavedBookingFromWebsite() {
    try {
      const saved =
        localStorage.getItem('rentmect_pending_booking') ||
        localStorage.getItem('rentMeCtBooking') ||
        localStorage.getItem('pendingBooking');

      const params = new URLSearchParams(window.location.search);
      const parsed = saved ? JSON.parse(saved) : {};

      applyBookingDataToPortal({
        pickupDate: params.get('pickupDate') || parsed.pickupDate || parsed.pickup_date || '',
        returnDate: params.get('returnDate') || parsed.returnDate || parsed.return_date || '',
        pickupTime: params.get('pickupTime') || parsed.pickupTime || parsed.pickup_time || '9:00 AM',
        returnTime: params.get('returnTime') || parsed.returnTime || parsed.return_time || '9:00 AM',
        selectedVehicle:
          params.get('selectedVehicle') ||
          parsed.selectedVehicle ||
          parsed.vehicleName ||
          parsed.vehicle_name ||
          '',
        selectedVehicleId:
          params.get('selectedVehicleId') ||
          params.get('vehicleId') ||
          parsed.selectedVehicleId ||
          parsed.selected_vehicle_id ||
          parsed.vehicleId ||
          parsed.vehicle_id ||
          '',
      });
    } catch (error) {
      notify(error.message || 'Could not load saved booking.');
    }
  }

  async function loadPortalData(userId) {
    setLoading(true);

    const [
      profileResult,
      vehiclesResult,
      rentalsResult,
      documentsResult,
      messagesResult,
      extensionsResult,
      fleetRentalsResult,
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('vehicles').select('*').order('created_at', { ascending: false }),
      supabase
        .from('rentals')
        .select('*, vehicles(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('rental_documents')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('rental_messages')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true }),
      supabase
        .from('rental_extension_requests')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase.rpc('get_vehicle_booking_blocks'),
    ]);

    if (profileResult.data) {
      setProfile(profileResult.data);
      setProfileForm({
        full_name: profileResult.data.full_name || '',
        phone: profileResult.data.phone || '',
        address: profileResult.data.address || '',
      });
      setPhoneVerified(Boolean(profileResult.data.phone_verified));
    }

    if (vehiclesResult.data) setVehicles(vehiclesResult.data);
    if (rentalsResult.data) setRentals(rentalsResult.data);
    if (documentsResult.data) setDocuments(documentsResult.data);
    if (messagesResult.data) setMessages(messagesResult.data);
    if (extensionsResult.data) setExtensionRequests(extensionsResult.data);
    if (fleetRentalsResult.data) setFleetRentals(fleetRentalsResult.data);

    setPortalDataReady(true);
    setLoading(false);
  }

  async function handleAuth(event) {
    event.preventDefault();
    setMessage('');

    if (authMode === 'sign-up') {
      const { error } = await supabase.auth.signUp({
        email: authForm.email,
        password: authForm.password,
        options: {
          data: {
            full_name: authForm.fullName,
            phone: authForm.phone,
            address: authForm.address,
            billing_same_as_home: authForm.billingSame,
            pending_booking: JSON.parse(localStorage.getItem('rentmect_pending_booking') || '{}'),
            pending_booking_id: pendingBookingId || getBookingIdFromUrl() || ''
          }
        },
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      setMessage('Account created. Check your email if verification is enabled.');
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: authForm.email,
      password: authForm.password,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    const bookingId = pendingBookingId || getBookingIdFromUrl();
    if (bookingId && data.session?.user?.id) {
      await supabase.rpc('claim_customer_pending_booking', {
        p_booking_id: bookingId,
        p_vehicle_id: pendingVehicleId || reservationForm.vehicleId || null,
      });
    }
  }
  async function handleForgotPassword() {
    const email = authForm.email.trim();

    if (!email) {
      setMessage('Enter your email first, then click Forgot Password.');
      return;
    }

    const redirectTo = import.meta.env.VITE_CLIENT_PORTAL_URL || window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('Password reset link sent. Check your email.');
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
  }

  async function saveProfile(event) {
    if (event) event.preventDefault();
    if (!session?.user?.id) return;

    const { data, error } = await supabase.rpc('save_customer_profile_contact_details', {
      p_full_name: profileForm.full_name,
      p_phone: profileForm.phone,
      p_address: profileForm.address,
    });

    if (error) {
      notify(error.message);
      return;
    }

    if (!data) {
      notify('Profile saved, but the updated profile was not returned.');
      return;
    }

    setProfile(data);
    setPhoneVerified(Boolean(data.phone_verified));
    notify('Profile saved.');
  }

  async function sendPhoneCode() {
  if (!profileForm.phone.trim()) {
    notify('Add your phone number first.');
    return;
  }

  setSendingCode(true);

  const { error } = await supabase.functions.invoke('send-phone-code', {
    body: { phone: normalizeUSPhone(profileForm.phone) },
  });

  setSendingCode(false);

  if (error) {
    notify(error.message || 'Failed to send verification code.');
    return;
  }

  notify('Verification code sent.');
}

async function verifyPhoneCode() {
  if (!session?.user?.id) return;

  if (!profileForm.phone.trim()) {
    notify('Add your phone number first.');
    return;
  }

  if (!phoneCode.trim()) {
    notify('Enter the verification code.');
    return;
  }

  setVerifyingCode(true);

  const { data, error } = await supabase.functions.invoke('check-phone-code', {
    body: {
      phone: normalizeUSPhone(profileForm.phone),
      code: phoneCode.trim(),
    },
  });

  setVerifyingCode(false);

  if (error) {
    notify(error.message || 'Phone verification failed.');
    return;
  }

  if (data?.status === 'approved') {
    setPhoneVerified(true);

    const { data: updatedProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (updatedProfile) {
      setProfile(updatedProfile);
    }

    notify('Phone verified.');
  } else {
    notify('Invalid verification code.');
  }
}

  async function createReservationIfNeeded() {
    if (!session?.user?.id) return null;

    if (currentRental) return currentRental;

    if (!selectedVehicle) {
      notify('Choose a vehicle first.');
      setWizardStep(1);
      return null;
    }

    if (!reservationForm.pickupDate || !reservationForm.returnDate || !reservationForm.pickupTime || !reservationForm.returnTime) {
      notify('Choose pickup date, return date, pickup time, and return time before continuing.');
      setWizardStep(1);
      return null;
    }

    if (!isVehicleAvailableForDates(selectedVehicle, reservationForm, fleetRentals, currentRental?.id)) {
      notify('This vehicle is not available for those dates. Please choose another vehicle or adjust your rental period.');
      setReservationForm((prev) => ({ ...prev, vehicleId: '' }));
      setWizardStep(1);
      return null;
    }

    if (!estimate || estimate.invalid) {
      notify('Return date must be after pickup date.');
      return null;
    }

    setReservationSaving(true);
    const { data: lockedRental, error } = await supabase.rpc('create_rental_with_lock', {
      p_vehicle_id: selectedVehicle.id,
      p_pickup_date: reservationForm.pickupDate,
      p_return_date: reservationForm.returnDate,
      p_pickup_time: reservationForm.pickupTime,
      p_return_time: reservationForm.returnTime,
    });
    setReservationSaving(false);

    if (error) {
      notify(error.message);
      return null;
    }

    const { data, error: reloadError } = await supabase
      .from('rentals')
      .select('*, vehicles(*)')
      .eq('id', lockedRental.id)
      .single();

    if (reloadError) {
      notify(reloadError.message);
      return null;
    }

    setRentals([data, ...rentals]);
    setFleetRentals((prev) => [{
      id: data.id,
      vehicle_id: data.vehicle_id,
      pickup_date: data.pickup_date,
      return_date: data.return_date,
      pickup_time: data.pickup_time,
      return_time: data.return_time,
      status: data.status,
    }, ...prev]);

    const bookingId = pendingBookingId || getBookingIdFromUrl();
    if (bookingId) {
      const { error: pendingUpdateError } = await supabase.rpc('convert_customer_pending_booking', {
        p_booking_id: bookingId,
        p_customer_phone: profileForm.phone || null,
        p_vehicle_id: selectedVehicle.id,
      });

      if (pendingUpdateError) {
        notify(pendingUpdateError.message || 'Could not mark pending booking as converted.');
      }
    }

    try {
      localStorage.removeItem('rentmect_pending_booking');
      localStorage.removeItem('rentMeCtBooking');
      localStorage.removeItem('pendingBooking');
    } catch {
      // ignore localStorage cleanup issue
    }

    return data;
  }

  function startNewReservation() {
    setReservationForm({
      vehicleId: '',
      pickupDate: getTodayDateInputValue(),
      returnDate: getNextDateInputValue(getTodayDateInputValue()),
      pickupTime: '9:00 AM',
      returnTime: '9:00 AM',
    });
    setPendingVehicleName('');
    setPendingVehicleId('');
    setCheckoutIntent(false);
    setCheckoutWizardStarted(false);
    setAgreementChecked(false);
    setSignatureName(profileForm.full_name || '');
    setActiveTab('overview');
    setWizardStep(1);
    setWizardOpen(true);
    notify('Start a new reservation by choosing dates and a vehicle.');
  }

  async function uploadDocument(event, documentType) {
    const file = event.target.files?.[0];
    if (!file || !session?.user?.id) return;

    const rental = currentRental || (await createReservationIfNeeded());

    if (!rental?.id) {
      notify('Create a reservation before uploading documents.');
      return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `${session.user.id}/${documentType}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('rental-documents')
      .upload(path, file, { upsert: false });

    if (uploadError) {
      notify(uploadError.message);
      return;
    }

    const { data, error } = await supabase
      .from('rental_documents')
      .insert({
        user_id: session.user.id,
        rental_id: rental.id,
        document_type: documentType,
        file_path: path,
        status: 'pending_review',
      })
      .select()
      .single();

    if (error) {
      notify(error.message);
      return;
    }

    const nextDocuments = [data, ...documents];
    setDocuments(nextDocuments);
    await syncRentalDocumentReviewStatus(rental, nextDocuments);
    await maybeMarkReadyForPickup(rental, nextDocuments);
    notify(`${documentTypeLabel(documentType)} uploaded.`);

    if (wizardOpen && documentType === 'license' && wizardStep === 4) {
      setWizardStep(5);
    }
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
      .from('rental-documents')
      .createSignedUrl(path, 60 * 5);

    if (error) {
      notify(error.message);
      return;
    }

    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function replaceDocument(event, document) {
    const file = event.target.files?.[0];
    if (!file || !session?.user?.id || !document?.id) return;

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const existingPath = document.file_path || document.storage_path || document.path;
    const path = existingPath || `${session.user.id}/${document.document_type}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('rental-documents')
      .upload(path, file, { upsert: true });

    if (uploadError) {
      notify(uploadError.message);
      return;
    }

    const { data, error } = await supabase.rpc('replace_customer_rental_document', {
      p_document_id: document.id,
      p_file_path: path,
    });

    if (error) {
      notify(error.message);
      return;
    }

    if (!data) {
      notify('Document replaced in storage, but the database row was not returned. Run the rental_documents table RLS policies.');
      return;
    }

    const nextDocuments = documents.map((item) => (item.id === data.id ? data : item));
    setDocuments(nextDocuments);
    await syncRentalDocumentReviewStatus(currentRental, nextDocuments);
    await maybeMarkReadyForPickup(currentRental, nextDocuments);
    notify(`${documentTypeLabel(document.document_type)} replaced and sent for review.`);
  }

  async function syncRentalDocumentReviewStatus(rental, nextDocuments) {
    if (!rental?.id || !['documents_needed', 'document_review'].includes(rental.status)) return;

    const rentalDocuments = nextDocuments.filter((document) => document.rental_id === rental.id);
    const hasLicense = isUsableDocument(latestDocument(nextDocuments, 'license'));
    const hasInsurance = isUsableDocument(latestDocument(rentalDocuments, 'insurance'));

    if (!hasLicense || !hasInsurance) return;

    const { data: updatedRental, error } = await supabase.rpc('sync_customer_rental_document_review_status', {
      p_rental_id: rental.id,
    });

    if (error) {
      notify(error.message);
      return;
    }

    const { data, error: reloadError } = await supabase
      .from('rentals')
      .select('*, vehicles(*)')
      .eq('id', updatedRental.id)
      .single();

    if (reloadError) {
      notify(reloadError.message);
      return;
    }

    setRentals((prev) => prev.map((item) => (item.id === data.id ? data : item)));
    setFleetRentals((prev) => prev.map((item) => (item.id === data.id ? { ...item, status: data.status } : item)));
    notify('Documents uploaded. Your rental is now in document review.', 'success');
  }

  async function maybeMarkReadyForPickup(rentalOverride = currentRental, nextDocuments = documents) {
    if (!rentalOverride?.id) return;
    if (rentalOverride.status === 'ready_for_pickup') return;
    if (!['documents_needed', 'document_review', 'approved'].includes(rentalOverride.status)) return;

    const rentalDocuments = nextDocuments.filter((document) => document.rental_id === rentalOverride.id);
    const ready =
      isApprovedDocument(latestDocument(nextDocuments, 'license')) &&
      isApprovedDocument(latestDocument(rentalDocuments, 'insurance')) &&
      Boolean(rentalOverride.agreement_signed) &&
      rentalOverride.payment_status === 'paid';

    if (!ready) return;

    const { data: updatedRental, error } = await supabase.rpc('mark_customer_rental_ready_for_pickup_if_eligible', {
      p_rental_id: rentalOverride.id,
    });

    if (error) {
      notify(error.message);
      return;
    }

    const { data, error: reloadError } = await supabase
      .from('rentals')
      .select('*, vehicles(*)')
      .eq('id', updatedRental.id)
      .single();

    if (reloadError) {
      notify(reloadError.message);
      return;
    }

    setRentals((prev) => prev.map((item) => (item.id === data.id ? data : item)));
    setFleetRentals((prev) => prev.map((item) => (item.id === data.id ? { ...item, status: data.status } : item)));
    notify('All steps complete. Your rental is ready for pickup.', 'success');
  }

  async function signAgreement() {
    if (!session?.user?.id) return;

    const rental = currentRental || (await createReservationIfNeeded());

    if (!rental?.id) {
      notify('Create a reservation first.');
      return;
    }

    if (!agreementChecked) {
      notify('Check the agreement box first.');
      return;
    }

    if (!signatureName.trim()) {
      notify('Type your full legal name as your signature.');
      return;
    }

    setAgreementSaving(true);
    const snapshot = buildAgreementWithDetails({
      agreementText: AGREEMENT_TEXT,
      profile: profileForm,
      email: userEmail,
      vehicle: selectedVehicle || rental?.vehicles,
      reservation: {
        pickupDate: reservationForm.pickupDate || rental.pickup_date,
        returnDate: reservationForm.returnDate || rental.return_date,
        pickupTime: reservationForm.pickupTime || rental.pickup_time,
        returnTime: reservationForm.returnTime || rental.return_time,
      },
      rental,
    });
    const agreementHash = await sha256(snapshot);

    const { data: signedRental, error } = await supabase.rpc('sign_rental_agreement', {
      p_rental_id: rental.id,
      p_signature_name: signatureName.trim(),
      p_agreement_version: AGREEMENT_VERSION,
      p_agreement_snapshot: snapshot,
      p_agreement_hash: agreementHash,
      p_user_agent: navigator.userAgent,
    });
    setAgreementSaving(false);

    if (error) {
      notify(error.message);
      return;
    }

    const { data: updatedRental, error: reloadError } = await supabase
      .from('rentals')
      .select('*, vehicles(*)')
      .eq('id', signedRental.id)
      .single();

    if (reloadError) {
      notify(reloadError.message);
      return;
    }

    setRentals((prev) => prev.map((r) => (r.id === updatedRental.id ? updatedRental : r)));
    await maybeMarkReadyForPickup(updatedRental);
    notify('Agreement signed.');
  }

  async function sendSupportMessage(event) {
    event.preventDefault();

    const text = supportText.trim();
    if (!text || !session?.user?.id) return;

    const { data, error } = await supabase
      .from('rental_messages')
      .insert({
        user_id: session.user.id,
        rental_id: currentRental?.id || null,
        sender_role: 'client',
        message: text,
        read_by_admin: false,
        read_by_client: true,
      })
      .select()
      .single();

    if (error) {
      notify(error.message);
      return;
    }

    setMessages([...messages, data]);
    setSupportText('');
  }

  async function confirmReturn() {
    if (!session?.user?.id || !currentRental?.id) {
      notify('No active rental to return.');
      return;
    }

    const alreadySent = messages.some((message) =>
      message.rental_id === currentRental.id &&
      message.sender_role === 'client' &&
      String(message.message || '').includes('RETURN CONFIRMATION')
    );

    if (alreadySent) {
      notify('Return confirmation has already been sent to Rent Me CT.');
      return;
    }

    if (pendingSameVehicleExtension) {
      notify('Return confirmation is locked while Rent Me CT decides your extension request.');
      return;
    }

    if (!returnCountdown.canConfirm) {
      notify(`Return confirmation unlocks at ${formatRentalDate(currentRental.return_date, currentRental.return_time)}.`);
      return;
    }

    setReturnSaving(true);
    const { data: messageData, error } = await supabase
      .from('rental_messages')
      .insert({
        user_id: session.user.id,
        rental_id: currentRental.id,
        sender_role: 'client',
        message: `RETURN CONFIRMATION: Customer reports the vehicle was returned to ${RENTMECT_ADDRESS} on ${new Date().toLocaleString()}. Please inspect, verify mileage/fuel/condition, then mark the rental completed.`,
        read_by_admin: false,
        read_by_client: true,
      })
      .select()
      .single();

    if (error) {
      setReturnSaving(false);
      notify(error.message);
      return;
    }

    const { data: returnedRental, error: statusError } = await supabase.rpc('initiate_customer_rental_return', {
      p_rental_id: currentRental.id,
    });
    setReturnSaving(false);

    if (statusError) {
      notify(statusError.message);
      return;
    }

    const { data: updatedRental, error: reloadError } = await supabase
      .from('rentals')
      .select('*, vehicles(*)')
      .eq('id', returnedRental.id)
      .single();

    if (reloadError) {
      notify(reloadError.message);
      return;
    }

    setMessages([...messages, messageData]);
    setRentals((prev) => prev.map((item) => (item.id === updatedRental.id ? updatedRental : item)));
    setFleetRentals((prev) => prev.map((item) => (item.id === updatedRental.id ? { ...item, status: updatedRental.status } : item)));
    notify('Return initiated. Rent Me CT will inspect and close out your rental.', 'success');
  }

  async function requestExtension(event) {
    event.preventDefault();
    if (!currentRental?.id) return;
    if (!extensionWindow.open) {
      notify(extensionWindow.message);
      return;
    }

    setExtensionSaving(true);
    const previewRpc = extensionMode === 'switch'
      ? 'preview_customer_vehicle_switch_continuation'
      : 'preview_customer_rental_extension';
    const { data: preview, error: previewError } = await supabase.rpc(previewRpc, {
      p_rental_id: currentRental.id,
      p_requested_return_date: extensionForm.returnDate,
      p_requested_return_time: extensionForm.returnTime,
    });

    if (previewError) {
      setExtensionSaving(false);
      notify(previewError.message);
      return;
    }

    setExtensionPreview(preview);

    if (extensionMode === 'switch') {
      setExtensionSaving(false);
      notify(preview?.recommended_vehicles?.length
        ? 'Choose an available replacement vehicle below to send the switch request.'
        : 'No replacement vehicle is available for that continuation window right now.');
      return;
    }

    if (!preview?.same_vehicle_available) {
      setExtensionSaving(false);
      notify('That vehicle is not available through the requested return time. Review the available alternatives below.');
      return;
    }

    const { data, error } = await supabase.rpc('request_customer_rental_extension', {
      p_rental_id: currentRental.id,
      p_requested_return_date: extensionForm.returnDate,
      p_requested_return_time: extensionForm.returnTime,
      p_customer_note: extensionForm.note,
    });
    setExtensionSaving(false);

    if (error) {
      notify(error.message);
      return;
    }

    setExtensionRequests((prev) => [data, ...prev.filter((request) => request.id !== data.id)]);
    setExtensionForm((prev) => ({ ...prev, note: '' }));
    setExtensionPreview(null);
    notify('Extension request sent for admin review.', 'success');
  }

  async function cancelExtensionRequest() {
    if (!pendingExtension?.id) return;

    setExtensionSaving(true);
    const { data, error } = await supabase.rpc('cancel_customer_rental_extension', {
      p_extension_request_id: pendingExtension.id,
    });
    setExtensionSaving(false);

    if (error) {
      notify(error.message);
      return;
    }

    setExtensionRequests((prev) => prev.map((request) => (request.id === data.id ? data : request)));
    setExtensionPreview(null);
    notify('Extension request cancelled.', 'success');
  }

  async function askForExtensionAlternative(vehicle) {
    if (!currentRental?.id) return;
    if (!extensionWindow.open) {
      notify(extensionWindow.message);
      return;
    }
    setExtensionSaving(true);
    const { data, error } = await supabase.rpc('request_customer_vehicle_switch_continuation', {
      p_rental_id: currentRental.id,
      p_replacement_vehicle_id: vehicle.id,
      p_requested_return_date: extensionForm.returnDate,
      p_requested_return_time: extensionForm.returnTime,
      p_customer_note: extensionForm.note,
    });
    setExtensionSaving(false);
    if (error) return notify(error.message);
    setExtensionRequests((prev) => [data, ...prev.filter((request) => request.id !== data.id)]);
    setExtensionPreview(null);
    notify(`Switch request sent for ${vehicle.name}. Your current rental return stays unchanged until a replacement is paid.`, 'success');
  }

  function openMaps() {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(RENTMECT_ADDRESS)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function beginWizard() {
    if (allGuidedStepsComplete) {
      notify('All guided steps are complete.');
      return;
    }
    setWizardStep(getNextGuidedStep());
    setWizardOpen(true);
  }

  function getNextGuidedStep() {
    if (!phoneVerified) return 0;
    if (!vehicleStepCompleted) return 1;
    if (!agreementSigned) return 2;
    if (!paymentPaid) return 3;
    if (!licenseUploaded) return 4;
    if (!insuranceUploaded) return 5;
    return 0;
  }

  function openWizardAtStep(step) {
    setActiveTab('overview');
    setWizardStep(step);
    setWizardOpen(true);
  }

  async function showLocalPaymentStatus() {
    notify('Local payment recording is handled in the admin portal until Stripe checkout is connected.');
  }

  async function nextWizardStep() {
    if (wizardStep === 0 && !phoneVerified) {
      notify('Please verify your phone number before continuing.');
      return;
    }

    if (wizardStep === 0 && phoneVerified && selectedVehicle && !currentRental) {
      const rental = await createReservationIfNeeded();
      if (!rental) return;
      setWizardStep(2);
      return;
    }

    if (wizardStep === 0 && phoneVerified && selectedVehicle && currentRental) {
      setWizardStep(2);
      return;
    }

    if (wizardStep === 1 && selectedVehicle && !currentRental) {
      const rental = await createReservationIfNeeded();
      if (!rental) return;
    }

    if (wizardStep === wizardSteps.length - 1) {
      setWizardOpen(false);
      return;
    }

    setWizardStep((step) => step + 1);
  }

  function skipWizardStep() {

    if (wizardStep === wizardSteps.length - 1) {
      setWizardOpen(false);
      return;
    }

    setWizardStep((step) => step + 1);
  }

  const wizardSteps = [
    {
      title: 'Verify Your Phone Number',
      icon: ShieldCheck,
      status: phoneVerified ? 'Completed' : 'Required',
      completed: phoneVerified,
    },
    {
      title: 'Choose Dates & Vehicle',
      icon: Car,
      status: vehicleStepCompleted ? 'Completed' : 'Required',
      completed: vehicleStepCompleted,
    },
    {
      title: 'Review & Sign Rental Agreement',
      icon: FileSignature,
      status: agreementSigned ? 'Completed' : 'Required',
      completed: agreementSigned,
    },
    {
      title: 'Pay Deposit & Rental Payment',
      icon: CreditCard,
      status: paymentPaid ? 'Completed' : 'Local Payment Pending',
      completed: paymentPaid,
    },
    {
      title: 'Upload Driver License',
      icon: Upload,
      status: licenseUploaded ? 'Completed' : 'Required Before Pickup',
      completed: licenseUploaded,
    },
    {
      title: 'Upload Insurance Paperwork',
      icon: FileText,
      status: insuranceUploaded ? 'Completed' : 'Required Before Pickup',
      completed: insuranceUploaded,
    },
  ];

  const agreementTextWithDetails = buildAgreementWithDetails({
    agreementText: AGREEMENT_TEXT,
    profile: profileForm,
    email: userEmail,
    vehicle: selectedVehicle || currentRental?.vehicles,
    reservation: reservationForm,
    rental: currentRental,
  });

  const tabs = [
    { key: 'overview', label: 'Overview', icon: CalendarDays },
    { key: 'guided', label: 'Guided Steps', icon: CheckCircle2 },
    { key: 'documents', label: 'Documents', icon: Upload },
    { key: 'agreement', label: 'Agreement', icon: FileSignature },
    { key: 'payment', label: 'Payment', icon: CreditCard },
    { key: 'history', label: 'Rental History', icon: FileText },
    { key: 'messages', label: 'Messages', icon: MessageCircle },
  ];

  if (loading) return <LoadingScreen />;

  if (!session) {
    return (
        <AuthScreen
          authMode={authMode}
          setAuthMode={setAuthMode}
          authForm={authForm}
          setAuthForm={setAuthForm}
          handleAuth={handleAuth}
          handleForgotPassword={handleForgotPassword}
          message={message}
          checkoutIntent={checkoutIntent}
          pendingVehicleName={pendingVehicleName}
          reservationForm={reservationForm}
        />
    );
  }

  return (
    <div className="portal-shell compact-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">RM</div>
          <div>
            <strong>Rent Me CT</strong>
            <span>Client Portal</span>
          </div>
        </div>

        <nav className="side-nav tab-nav">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={activeTab === key ? 'active' : ''}
              onClick={() => setActiveTab(key)}
            >
              <Icon size={18} /> {label}
            </button>
          ))}
        </nav>

        <button className="logout-btn" onClick={signOut}>
          <LogOut size={17} /> Log Out
        </button>
      </aside>

      <main className="portal-main compact-main">
        {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}
        <header className="portal-header compact-header">
          <div>
            <p className="eyebrow">Welcome back</p>
            <h1>{userName}</h1>
            <span>{userEmail} • {emailVerified ? 'Email verified' : 'Email verification pending'}</span>
          </div>
          <div className="header-actions">
            <button className="return-btn" onClick={openMaps}>
              <MapPin size={18} /> Location
            </button>
            <button className="primary-btn" onClick={beginWizard}>
              <CheckCircle2 size={18} /> {allGuidedStepsComplete ? 'Guided Steps Complete' : 'Start Guided Steps'}
            </button>
          </div>
        </header>

        <MobileFlowStatus items={mobileStatusItems} />

        {activeTab === 'overview' && (
          <>
            <section className="hero-panel compact-hero" id="reservation">
              <div>
                <p className="eyebrow">Reservation Setup</p>
                {displayedVehicle && (
                  <div className="selected-vehicle-media">
                    <img src={getVehicleImage(displayedVehicle)} alt={`${displayedVehicle.name} rental vehicle`} loading="lazy" />
                  </div>
                )}
                <h2>{displayedVehicle?.name || 'Finish Your Rental'}</h2>
                <p>
                  Complete your phone verification, vehicle, documents, agreement, and payment through the guided flow.
                </p>

                <div className="reservation-summary compact-summary">
                  <SummaryItem label="Pickup" value={formatRentalDate(overviewPickupDate, overviewPickupTime)} />
                  <SummaryItem label="Return" value={formatRentalDate(overviewReturnDate, overviewReturnTime)} />
                  <SummaryItem label="Vehicle" value={currentRental?.vehicles?.name || selectedVehicle?.name || 'Not selected yet'} />
                  <SummaryItem label="Status" value={prettyStatus(currentRental?.status || 'pending setup')} />
                </div>
              </div>
              <div className="hero-cta-stack">
                {!currentRental && (
                  <button className="primary-btn" onClick={hasCompletedRental ? startNewReservation : createReservationIfNeeded} disabled={reservationSaving}>
                    {reservationSaving ? 'Creating Reservation...' : hasCompletedRental ? 'Create New Reservation' : 'Create Reservation'}
                  </button>
                )}
              </div>
            </section>

            <section className="metric-grid compact-metrics">
              <Metric icon={Clock} label="Pickup" value={formatRentalDate(overviewPickupDate, overviewPickupTime)} />
              <Metric icon={Clock} label="Return" value={formatRentalDate(overviewReturnDate, overviewReturnTime)} />
              <Metric icon={CalendarDays} label="Rental Days" value={getRentalDaysSafe(overviewPickupDate, overviewReturnDate)} />
              <Metric icon={CreditCard} label="Deposit" value={currentRental ? money(currentRental.security_deposit) : selectedVehicle ? money(selectedVehicle.security_deposit) : 'Pending'} />
            </section>

            {currentRental && (
              <section className="panel return-panel">
                <p className="eyebrow">Return Status</p>
                <h3>{returnCountdown.label}</h3>
                <div className="reservation-summary compact-summary">
                  <SummaryItem label="Due" value={formatRentalDate(currentRental.return_date, currentRental.return_time)} />
                  <SummaryItem label="Time Left" value={returnCountdown.value} />
                  <SummaryItem label="Return Location" value={RENTMECT_ADDRESS} />
                </div>
                <div className="return-workflow-grid">
                  <div className="return-action-block">
                    <p className="muted">
                      Send return confirmation after dropoff. Rent Me CT inspects mileage, fuel, and condition before closing the rental and deposit.
                    </p>
                    {returnConfirmationSent && (
                      <div className="return-confirmation-box">
                        <CheckCircle2 size={20} />
                        <div>
                          <strong>Return confirmation sent</strong>
                          <span>Rent Me CT has been notified. We will inspect the vehicle and close out your rental.</span>
                        </div>
                      </div>
                    )}
                    {showApprovedSwitchVehicle && (
                      <div className="next-vehicle-card">
                        <span className="next-vehicle-image">
                          <img src={getVehicleImage(approvedSwitchVehicle)} alt={`${approvedSwitchVehicle.name} replacement rental vehicle`} loading="lazy" />
                        </span>
                        <div>
                          <strong>{approvedSwitchVehicle.name}</strong>
                          <span>Approved replacement vehicle</span>
                          <small>
                            Starts after this return. Payment is required before the replacement rental activates.
                          </small>
                        </div>
                      </div>
                    )}
                    <button className="primary-btn" onClick={confirmReturn} disabled={returnSaving || returnConfirmationSent || Boolean(pendingSameVehicleExtension) || !returnCountdown.canConfirm}>
                      <CheckCircle2 size={18} /> {returnSaving ? 'Sending Return Confirmation...' : returnConfirmationSent ? 'Return Confirmation Sent' : pendingSameVehicleExtension ? 'Extension Decision Pending' : returnCountdown.canConfirm ? 'Confirm Vehicle Returned' : 'Return Confirmation Locked'}
                    </button>
                    {approvedUnpaidExtension && (
                      <p className="extension-payment-note">
                        {approvedUnpaidExtension.request_kind === 'switch_car_continuation'
                          ? `Switch approved through ${formatRentalDate(approvedUnpaidExtension.requested_return_date, approvedUnpaidExtension.requested_return_time)}. Payment is required before the replacement vehicle activates.`
                          : `Extension approved through ${formatRentalDate(approvedUnpaidExtension.requested_return_date, approvedUnpaidExtension.requested_return_time)}. Payment is required before the longer return window activates.`}
                      </p>
                    )}
                    {activatedExtension && (
                      <p className="extension-payment-note paid">
                        Extension payment recorded. This rental now returns {formatRentalDate(currentRental.return_date, currentRental.return_time)}.
                      </p>
                    )}
                  </div>
                  <form className="portal-form extension-form" onSubmit={requestExtension}>
                    <div className="extension-heading">
                      <strong>Need more time?</strong>
                      <span>{extensionWindow.open
                        ? extensionMode === 'switch'
                          ? 'Choose a replacement that can start when this rental is due back.'
                          : 'Check this vehicle before asking for admin approval.'
                        : extensionWindow.message}</span>
                    </div>
                  {latestExtensionStatus && (
                    <div className={`mobile-extension-status ${latestExtensionStatus.status}`}>
                      <strong>{extensionStatusTitle(latestExtensionStatus)}</strong>
                      <span>{extensionStatusText(latestExtensionStatus)}</span>
                    </div>
                  )}
                  {(extensionWindow.open || pendingExtension || approvedUnpaidExtension) && <>
                  <div className="extension-mode" role="group" aria-label="Continuation type">
                    <button
                      type="button"
                      className={extensionMode === 'extend' ? 'active' : ''}
                      onClick={() => {
                        setExtensionMode('extend');
                        setExtensionPreview(null);
                      }}
                    >
                      Keep This Car
                    </button>
                    <button
                      type="button"
                      className={extensionMode === 'switch' ? 'active' : ''}
                      onClick={() => {
                        setExtensionMode('switch');
                        setExtensionPreview(null);
                      }}
                    >
                      Switch Vehicle
                    </button>
                  </div>
                  {pendingExtension && <div className="extension-pending-actions">
                    <p className="auth-message">
                      Pending {pendingExtension.request_kind === 'switch_car_continuation' ? 'switch' : 'extension'} request:
                      {' '}{formatRentalDate(pendingExtension.requested_return_date, pendingExtension.requested_return_time)}
                    </p>
                    <button className="secondary-btn" type="button" onClick={cancelExtensionRequest} disabled={extensionSaving}>Cancel Extension Request</button>
                  </div>}
                  {approvedUnpaidExtension && <p className="auth-message">Approved extension is waiting for payment before the new return date becomes active.</p>}
                  <input
                    type="date"
                    min={currentRental.return_date}
                    value={extensionForm.returnDate}
                    onChange={(event) => {
                      setExtensionPreview(null);
                      setExtensionForm({ ...extensionForm, returnDate: event.target.value });
                    }}
                    required
                  />
                  <select value={extensionForm.returnTime} onChange={(event) => {
                    setExtensionPreview(null);
                    setExtensionForm({ ...extensionForm, returnTime: event.target.value });
                  }}>
                    {timeOptions().map((time) => <option key={time}>{time}</option>)}
                  </select>
                  <input
                    placeholder="Optional note for Rent Me CT"
                    value={extensionForm.note}
                    onChange={(event) => setExtensionForm({ ...extensionForm, note: event.target.value })}
                  />
                  <button className="secondary-btn" disabled={extensionSaving || Boolean(pendingExtension) || Boolean(approvedUnpaidExtension)}>
                    {extensionSaving
                      ? 'Checking...'
                      : pendingExtension
                        ? 'Request Pending'
                        : approvedUnpaidExtension
                          ? 'Payment Required'
                          : extensionMode === 'switch'
                            ? 'Find Switch Vehicles'
                            : 'Request Extension'}
                  </button>
                  {extensionPreview && (extensionMode === 'switch' || !extensionPreview.same_vehicle_available) && (
                    <div className="extension-alternatives">
                      <p className="auth-message">
                        {extensionMode === 'switch'
                          ? `A switch starts at this rental's original return time: ${formatRentalDate(extensionPreview.switch_start_date, extensionPreview.switch_start_time)}.`
                          : `${extensionPreview.current_vehicle?.name || 'This vehicle'} is already blocked for that longer return window.`}
                        {extensionPreview.recommended_vehicles?.length ? ' Available replacement vehicles:' : ' No alternate vehicle is available for that window right now.'}
                      </p>
                      {extensionPreview.recommended_vehicles?.length > 0 && (
                        <div className="extension-alternative-list">
                          {extensionPreview.recommended_vehicles.map((vehicle) => (
                            <button className="extension-alternative" type="button" key={vehicle.id} onClick={() => askForExtensionAlternative(vehicle)}>
                              <strong>{vehicle.name}</strong>
                              <span>
                                {vehicle.similarity_rank === 0
                                  ? 'Same model'
                                  : vehicle.similarity_rank === 1
                                    ? 'Similar type'
                                    : vehicle.similarity_rank === 2
                                      ? 'Same brand'
                                      : 'Available option'}
                              </span>
                              <small>{money(vehicle.daily_rate)}/day • Request switch</small>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  </>}
                  </form>
                </div>
              </section>
            )}

            {switchContinuationRental && switchContinuationRental.id !== currentRental?.id && (
              <section className="panel continuation-panel">
                <p className="eyebrow">Paid Continuation</p>
                <h3>Replacement Rental Unlocked</h3>
                <div className="reservation-summary compact-summary">
                  <SummaryItem label="Vehicle" value={switchContinuationRental.vehicles?.name || 'Replacement vehicle'} />
                  <SummaryItem label="Pickup" value={formatRentalDate(switchContinuationRental.pickup_date, switchContinuationRental.pickup_time)} />
                  <SummaryItem label="Return" value={formatRentalDate(switchContinuationRental.return_date, switchContinuationRental.return_time)} />
                  <SummaryItem label="Status" value={prettyStatus(switchContinuationRental.status)} />
                </div>
                <p className="muted">Your current rental still needs its normal return confirmation. The replacement rental keeps its own agreement and insurance review flow.</p>
              </section>
            )}

            <section className="panel large-panel checklist-panel">
              <div className="panel-heading split-heading">
                <div>
                  <p className="eyebrow">Rental Checklist</p>
                  <h3>Complete Before Pickup</h3>
                </div>
                <button className="secondary-btn" onClick={beginWizard} disabled={allGuidedStepsComplete}>{allGuidedStepsComplete ? 'All Steps Complete' : 'Open Guided Flow'}</button>
              </div>

              <div className="checklist compact-checklist">
                <ChecklistItem icon={ShieldCheck} title="Email Verification" status={emailVerified ? 'Verified' : 'Check email'} completed={emailVerified} onOpen={() => notify('Check your inbox for the Supabase verification email.')} />
                <ChecklistItem icon={ShieldCheck} title="Phone Verification" status={phoneVerified ? 'Verified' : 'Required'} completed={phoneVerified} onOpen={() => openWizardAtStep(0)} />
                <ChecklistItem icon={Car} title="Dates & Vehicle" status={vehicleStepCompleted ? 'Selected' : 'Required'} completed={vehicleStepCompleted} onOpen={() => openWizardAtStep(1)} />
                <ChecklistItem icon={FileSignature} title="Rental Agreement" status={agreementSigned ? 'Signed' : 'Required'} completed={agreementSigned} onOpen={() => openWizardAtStep(2)} />
                <ChecklistItem icon={CreditCard} title="Deposit & Rental Payment" status={paymentPaid ? 'Paid' : 'Local Payment Pending'} completed={paymentPaid} onOpen={() => openWizardAtStep(3)} />
                <ChecklistItem icon={Upload} title="Driver License Upload" status={licenseUploaded ? 'Uploaded' : 'Required Before Pickup'} completed={licenseUploaded} onOpen={() => openWizardAtStep(4)} />
                <ChecklistItem icon={FileText} title="Insurance Upload" status={insuranceUploaded ? 'Uploaded' : 'Required Before Pickup'} completed={insuranceUploaded} onOpen={() => openWizardAtStep(5)} />
              </div>
              {(missingRequiredDocuments || documentsRejected) && (
                <DocumentRequirementNotice
                  licenseUploaded={licenseUploaded}
                  insuranceUploaded={insuranceUploaded}
                  licenseRejected={licenseRejected}
                  insuranceRejected={insuranceRejected}
                />
              )}
            </section>

            <section className="panel" id="profile">
              <p className="eyebrow">Profile</p>
              <h3>Customer Information</h3>
              <form className="portal-form" onSubmit={saveProfile}>
                <input
                  placeholder="Full legal name"
                  value={profileForm.full_name}
                  onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                />
                <input
                  placeholder="Phone number"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                />
                <input
                  placeholder="Home address"
                  value={profileForm.address}
                  onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                />
               <div className="phone-verify-box">
                <div className="button-row">
                  <button className="primary-btn" type="submit">Save Profile</button>

                  <button className="secondary-btn" type="button" onClick={sendPhoneCode} disabled={sendingCode || phoneVerified}>
                    {phoneVerified ? 'Phone Verified' : sendingCode ? 'Sending...' : 'Send Code'}
                  </button>
                </div>

                {!phoneVerified && (
                  <div className="phone-code-row">
                    <input
                      placeholder="Enter verification code"
                      value={phoneCode}
                      onChange={(e) => setPhoneCode(e.target.value)}
                    />

                    <button className="primary-btn" type="button" onClick={verifyPhoneCode} disabled={verifyingCode}>
                      {verifyingCode ? 'Verifying...' : 'Verify Phone'}
                    </button>
                  </div>
                     )}
                  </div>
              </form>
            </section>
          </>
        )}

        {activeTab === 'guided' && (
          <section className="panel centered-panel">
            <p className="eyebrow">Guided Rental Flow</p>
            <h3>One Step at a Time</h3>
            <p className="muted">This opens the focused pop-up that walks the customer through the exact rental process without page clutter.</p>
            <button className="primary-btn big-action" onClick={beginWizard}>
              <CheckCircle2 size={20} /> {allGuidedStepsComplete ? 'Guided Steps Complete' : 'Start Guided Steps'}
            </button>
          </section>
        )}

        {activeTab === 'documents' && (
          <>
            {(missingRequiredDocuments || documentsRejected) && (
              <section className="content-grid two compact-cards">
                {!licenseUploaded && (
                  <UploadCard
                    title={licenseRejected ? 'Replace Driver License' : 'Upload Driver License'}
                    text={licenseRejected ? 'The saved driver license was rejected. Upload a replacement to keep it on file.' : 'Upload a clear image or PDF once. Returning rentals can reuse this driver license.'}
                    icon={Upload}
                    onUpload={(e) => uploadDocument(e, 'license')}
                  />
                )}
                {!insuranceUploaded && (
                  <UploadCard
                    title={insuranceRejected ? 'Replace Insurance' : 'Upload Insurance'}
                    text={insuranceRejected ? 'This rental insurance upload was rejected. Upload a replacement for review.' : 'Upload proof of active auto insurance for this rental.'}
                    icon={FileText}
                    onUpload={(e) => uploadDocument(e, 'insurance')}
                  />
                )}
              </section>
            )}
            {licenseUploaded && !currentRentalLicenseDocument && (
              <p className="document-on-file-note">Driver license on file. This rental only needs a fresh insurance upload.</p>
            )}
            <UploadedDocuments documents={documentsForActiveRental} currentRental={currentRental} openDocument={openDocument} replaceDocument={replaceDocument} />
          </>
        )}

        {activeTab === 'agreement' && (
          <section className="panel centered-panel agreement-card-clean">
            <p className="eyebrow">Agreement</p>
            <h3>Rental Agreement</h3>
            <p className="muted">
              The agreement no longer sits across the whole portal. Open it, read it inside the pop-up, sign, and close.
            </p>
            <div className="agreement-status-box">
              <FileSignature size={24} />
              <div>
                <strong>{agreementSigned ? 'Agreement Signed' : 'Agreement Not Signed Yet'}</strong>
                <span>{agreementSigned ? 'You are all set for this step.' : 'Review and sign before pickup.'}</span>
              </div>
            </div>
            <button className="primary-btn big-action" onClick={() => setAgreementModalOpen(true)}>
              <FileSignature size={18} /> Review & Sign Agreement
            </button>
          </section>
        )}

        {activeTab === 'payment' && (
          <section className="panel payment-panel-clean" id="payment">
            <p className="eyebrow">Billing</p>
            <h3>Deposit & Rental Payment</h3>
            <p className="muted">
              Review the exact amount due today before payment. Your security deposit is refundable after return if there are no unpaid tolls, tickets, excess mileage, cleaning, smoking, late, or damage charges.
            </p>
            <div className="payment-summary-grid">
              <div className="invoice-row"><span>Rental Days</span><strong>{currentRental ? getRentalDaysSafe(currentRental.pickup_date, currentRental.return_date) : estimate ? `${estimate.days} days` : 'Pending'}</strong></div>
              <div className="invoice-row"><span>Rental</span><strong>{currentRental ? money(currentRental.rental_total) : estimate ? money(estimate.rentalTotal) : 'Pending'}</strong></div>
              <div className="invoice-row"><span>CT Sales Tax</span><strong>{currentRental ? money(currentRental.tax_amount) : estimate ? money(estimate.taxAmount) : 'Pending'}</strong></div>
              <div className="invoice-row"><span>Security Deposit</span><strong>{currentRental ? money(currentRental.security_deposit) : estimate ? money(estimate.securityDeposit) : 'Pending'}</strong></div>
              <div className="invoice-row"><span>Mileage Included</span><strong>{MILEAGE_POLICY}</strong></div>
              <div className="invoice-row"><span>Pickup Address</span><strong>{RENTMECT_ADDRESS}</strong></div>
              <div className="invoice-row"><span>Required Before Pickup</span><strong>Phone, agreement, payment, saved driver license, and insurance for this rental</strong></div>
              <div className="invoice-row"><span>Cancellation</span><strong>{CANCELLATION_TERMS}</strong></div>
              <div className="invoice-row total-row"><span>Total Due Today</span><strong>{estimate && !estimate.invalid ? money(estimate.checkoutTotal + estimate.securityDeposit) : currentRental ? money(Number(currentRental.rental_total || 0) + Number(currentRental.tax_amount || 0) + Number(currentRental.security_deposit || 0)) : 'Pending'}</strong></div>
            </div>
            <div className="agreement-status-box">
              <CheckCircle2 size={24} />
              <div>
                <strong>After payment</strong>
                <span>Rent Me CT reviews the required documents, confirms pickup, and keeps the reservation visible here for messages and return instructions.</span>
              </div>
            </div>
            {(missingRequiredDocuments || documentsRejected) && (
              <DocumentRequirementNotice
                licenseUploaded={licenseUploaded}
                insuranceUploaded={insuranceUploaded}
                licenseRejected={licenseRejected}
                insuranceRejected={insuranceRejected}
              />
            )}
            {paymentPaid && <p className="auth-message">Payment recorded. Deposit is marked as held.</p>}
            {approvedUnpaidExtension && (
              <div className="extension-payment-card">
                <strong>Extension Payment Required</strong>
                <span>Approved return: {formatRentalDate(approvedUnpaidExtension.requested_return_date, approvedUnpaidExtension.requested_return_time)}</span>
                <span>Extension due: {money(approvedUnpaidExtension.extension_total_amount)}</span>
                <small>Local testing payment is recorded by the admin portal now. Stripe will replace this payment handoff later.</small>
              </div>
            )}
            <button className="primary-btn big-action" onClick={showLocalPaymentStatus} disabled={paymentSaving || paymentPaid}>
              <CreditCard size={18} /> {paymentPaid ? 'Payment Complete' : paymentSaving ? 'Preparing Payment...' : 'Local Payment Pending'}
            </button>
          </section>
        )}

        {activeTab === 'history' && (
          <section className="panel" id="history">
            <p className="eyebrow">Previous Orders</p>
            <h3>Rental History</h3>
            {previousRentals.length === 0 && <p className="muted">No previous rentals yet.</p>}
            {previousRentals.map((order) => (
              <div className="history-row" key={order.id}>
                <div>
                  <strong>{order.vehicles?.name || 'Vehicle'}</strong>
                  <span>{formatRentalDate(order.pickup_date, order.pickup_time)} - {formatRentalDate(order.return_date, order.return_time)}</span>
                </div>
                <em>{prettyStatus(order.status)}</em>
              </div>
            ))}
          </section>
        )}

        {activeTab === 'messages' && (
          <section className="panel messages-panel" id="messages">
            <p className="eyebrow">Support</p>
            <h3>Message Rent Me CT</h3>
            <div className="message-box tall-message-box">
              {messages.length === 0 && (
                <div className="message">
                  <strong>Rent Me CT</strong>
                  <p>Send us a message about pickup, return, extension, documents, agreement, or billing.</p>
                  <span>Now</span>
                </div>
              )}
              {messages.map((m) => (
                <div className={m.sender_role === 'client' ? 'message own' : 'message'} key={m.id}>
                  <strong>{m.sender_role === 'client' ? 'You' : 'Rent Me CT'}</strong>
                  <p>{m.message}</p>
                  <span>{new Date(m.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <form className="support-form" onSubmit={sendSupportMessage}>
              <input
                value={supportText}
                onChange={(e) => setSupportText(e.target.value)}
                placeholder="Ask about pickup, return, extension, documents, billing..."
              />
              <button>Send</button>
            </form>
          </section>
        )}
      </main>

      {agreementModalOpen && (
        <AgreementModal
          agreementText={agreementTextWithDetails}
          agreementChecked={agreementChecked}
          setAgreementChecked={setAgreementChecked}
          signatureName={signatureName}
          setSignatureName={setSignatureName}
          signAgreement={signAgreement}
          agreementSaving={agreementSaving}
          onClose={() => setAgreementModalOpen(false)}
        />
      )}

      {wizardOpen && (
        <WizardModal
          wizardSteps={wizardSteps}
          wizardStep={wizardStep}
          setWizardOpen={setWizardOpen}
          nextWizardStep={nextWizardStep}
          skipWizardStep={skipWizardStep}
          profileForm={profileForm}
          setProfileForm={setProfileForm}
          phoneCode={phoneCode}
          setPhoneCode={setPhoneCode}
          sendPhoneCode={sendPhoneCode}
          verifyPhoneCode={verifyPhoneCode}
          sendingCode={sendingCode}
          verifyingCode={verifyingCode}
          phoneVerified={phoneVerified}
          vehicles={vehicles}
          reservationForm={reservationForm}
          setReservationForm={setReservationForm}
          selectedVehicle={selectedVehicle}
          estimate={estimate}
          createReservationIfNeeded={createReservationIfNeeded}
          reservationSaving={reservationSaving}
          runTestStripePayment={showLocalPaymentStatus}
          paymentSaving={paymentSaving}
          paymentPaid={paymentPaid}
          uploadDocument={uploadDocument}
          licenseUploaded={licenseUploaded}
          insuranceUploaded={insuranceUploaded}
          agreementChecked={agreementChecked}
          setAgreementChecked={setAgreementChecked}
          signatureName={signatureName}
          setSignatureName={setSignatureName}
          signAgreement={signAgreement}
          agreementSaving={agreementSaving}
          agreementText={agreementTextWithDetails}
          currentRental={currentRental}
          fleetRentals={fleetRentals}
        />
      )}
    </div>
  );
}

function WizardModal({
  wizardSteps,
  wizardStep,
  setWizardOpen,
  nextWizardStep,
  skipWizardStep,
  profileForm,
  setProfileForm,
  phoneCode,
  setPhoneCode,
  sendPhoneCode,
  verifyPhoneCode,
  sendingCode,
  verifyingCode,
  phoneVerified,
  vehicles,
  reservationForm,
  setReservationForm,
  selectedVehicle,
  estimate,
  createReservationIfNeeded,
  reservationSaving,
  runTestStripePayment,
  paymentSaving,
  paymentPaid,
  uploadDocument,
  licenseUploaded,
  insuranceUploaded,
  agreementChecked,
  setAgreementChecked,
  signatureName,
  setSignatureName,
  signAgreement,
  agreementSaving,
  agreementText,
  currentRental,
  fleetRentals,
}) {
  const step = wizardSteps[wizardStep];
  const Icon = step.icon;

  return (
    <div className="wizard-backdrop">
      <div className="wizard-modal">
        <div className="wizard-header">
          <div>
            <p className="eyebrow">Step {wizardStep + 1} of {wizardSteps.length}</p>
            <h2><Icon size={24} /> {step.title}</h2>
            <span>{step.status}</span>
          </div>
          <button className="wizard-close" onClick={() => setWizardOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <div className="wizard-progress">
          {wizardSteps.map((item, index) => (
            <div
              key={item.title}
              className={[
                'wizard-dot',
                item.completed ? 'complete' : '',
                index === wizardStep && !item.completed ? 'active' : '',
              ].filter(Boolean).join(' ')}
            >
              {item.completed ? <CheckCircle2 size={15} /> : index + 1}
            </div>
          ))}
        </div>

        <div className="wizard-body">
          {wizardStep === 0 && (
            <div className="portal-form">
              <p className="muted">
                Add your phone number, send a verification code, then enter the code to verify your account.
              </p>

              <input
                placeholder="Phone number, example 8605551234"
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
              />

              <button className="primary-btn" onClick={sendPhoneCode} disabled={sendingCode || phoneVerified}>
                {phoneVerified ? 'Phone Verified' : sendingCode ? 'Sending...' : 'Send Verification Code'}
              </button>

              {!phoneVerified && (
                <>
                  <input
                    placeholder="Enter verification code"
                    value={phoneCode}
                    onChange={(e) => setPhoneCode(e.target.value)}
                  />

                  <button className="secondary-btn" onClick={verifyPhoneCode} disabled={verifyingCode}>
                    {verifyingCode ? 'Verifying...' : 'Verify Phone'}
                  </button>
                </>
              )}
            </div>
          )}

          {wizardStep === 1 && (
            <div className="portal-form">
              <p className="muted">Choose your rental dates first, then select an available vehicle.</p>

              <div className="vehicle-date-grid">
                <input
                  type="date"
                  min={getTodayDateInputValue()}
                  value={reservationForm.pickupDate}
                  onChange={(e) => {
                    const pickupDate = e.target.value || getTodayDateInputValue();
                    const minReturnDate = getNextDateInputValue(pickupDate);
                    setReservationForm({
                      ...reservationForm,
                      pickupDate,
                      returnDate: reservationForm.returnDate && reservationForm.returnDate >= minReturnDate
                        ? reservationForm.returnDate
                        : minReturnDate,
                    });
                  }}
                />

                <input
                  type="date"
                  min={getNextDateInputValue(reservationForm.pickupDate || getTodayDateInputValue())}
                  value={reservationForm.returnDate}
                  onChange={(e) => setReservationForm({ ...reservationForm, returnDate: e.target.value })}
                />

                <select
                  value={reservationForm.pickupTime}
                  onChange={(e) => setReservationForm({ ...reservationForm, pickupTime: e.target.value })}
                >
                  {timeOptions().map((t) => <option key={t}>{t}</option>)}
                </select>

                <select
                  value={reservationForm.returnTime}
                  onChange={(e) => setReservationForm({ ...reservationForm, returnTime: e.target.value })}
                >
                  {timeOptions().map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>

              <div className="vehicle-picker-grid">
                {vehicles.map((vehicle) => {
                  const selected = reservationForm.vehicleId === vehicle.id;
                  const bookable = isVehicleAvailableForDates(vehicle, reservationForm, fleetRentals, currentRental?.id);
                  const statusLabel = bookable ? 'Available' : vehicleAvailabilityLabel(vehicle, reservationForm, fleetRentals, currentRental?.id);

                  return (
                    <button
                      type="button"
                      key={vehicle.id}
                      className={[
                        'vehicle-picker-card',
                        selected ? 'selected' : '',
                        !bookable ? 'disabled' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => {
                        if (!bookable) return;
                        setReservationForm({ ...reservationForm, vehicleId: vehicle.id });
                      }}
                      disabled={!bookable}
                      aria-pressed={selected}
                    >
                      {selected && (
                        <span
                          className="vehicle-clear-button"
                          role="button"
                          tabIndex={0}
                          aria-label={`Clear ${vehicle.name}`}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setReservationForm({ ...reservationForm, vehicleId: '' });
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            event.stopPropagation();
                            setReservationForm({ ...reservationForm, vehicleId: '' });
                          }}
                        >
                          <X size={16} />
                        </span>
                      )}
                      <span className="vehicle-picker-image">
                        <img src={getVehicleImage(vehicle)} alt={`${vehicle.name} rental vehicle`} loading="lazy" />
                      </span>
                      <span className="vehicle-picker-info">
                        <strong>{vehicle.name}</strong>
                        <span>{money(vehicle.daily_rate)}/day</span>
                        <small>{statusLabel}</small>
                      </span>
                      <span className="vehicle-picker-action">{selected ? 'Selected' : bookable ? 'Select Vehicle' : 'Unavailable'}</span>
                    </button>
                  );
                })}
              </div>

              {estimate && (
                <div className="invoice-row">
                  <span>{estimate.invalid ? 'Return date must be after pickup' : `${estimate.days} rental days`}</span>
                  <strong>{estimate.invalid ? 'Invalid' : `${money(estimate.checkoutTotal)} + deposit ${money(estimate.securityDeposit)}`}</strong>
                </div>
              )}

              <button className="primary-btn" onClick={createReservationIfNeeded} disabled={reservationSaving || Boolean(currentRental)}>
                {currentRental ? 'Reservation Created' : reservationSaving ? 'Creating Reservation...' : 'Create Reservation'}
              </button>
            </div>
          )}

          {wizardStep === 2 && (
            <div>
              <p className="muted">
                Read the full agreement, check the box, and type your legal name to sign.
              </p>

              <div className="agreement-preview wizard-agreement">
                <pre>{agreementText}</pre>
              </div>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={agreementChecked}
                  onChange={(e) => setAgreementChecked(e.target.checked)}
                />
                I have read and agree to the rental agreement.
              </label>

              <input
                className="signature-input"
                placeholder="Type full legal name as signature"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
              />

              <button className="primary-btn" onClick={signAgreement} disabled={agreementSaving}>
                {agreementSaving ? 'Signing...' : 'Sign Agreement'}
              </button>
            </div>
          )}

          {wizardStep === 3 && (
            <div>
              <p className="muted">
                Confirm the totals, refundable deposit rules, mileage, pickup address, and required items before continuing to payment.
              </p>

              <div className="invoice-row"><span>Rental Days</span><strong>{currentRental ? getRentalDaysSafe(currentRental.pickup_date, currentRental.return_date) : estimate ? `${estimate.days} days` : 'Pending'}</strong></div>
              <div className="invoice-row"><span>Rental</span><strong>{currentRental ? money(currentRental.rental_total) : estimate ? money(estimate.rentalTotal) : 'Pending'}</strong></div>
              <div className="invoice-row"><span>Taxes</span><strong>{currentRental ? money(currentRental.tax_amount) : estimate ? money(estimate.taxAmount) : 'Pending'}</strong></div>
              <div className="invoice-row"><span>Security Deposit</span><strong>{currentRental ? money(currentRental.security_deposit) : estimate ? money(estimate.securityDeposit) : 'Pending'}</strong></div>
              <div className="invoice-row"><span>Mileage</span><strong>{MILEAGE_POLICY}</strong></div>
              <div className="invoice-row"><span>Pickup</span><strong>{RENTMECT_ADDRESS}</strong></div>
              <div className="invoice-row"><span>Required Before Pickup</span><strong>A saved driver license and insurance for this rental are required before vehicle release.</strong></div>
              <div className="invoice-row"><span>After payment</span><strong>Upload documents so Rent Me CT can review and confirm pickup details.</strong></div>

              {paymentPaid && <p className="auth-message">Payment recorded. Deposit is marked as held.</p>}
              {(!licenseUploaded || !insuranceUploaded) && (
                <div className="pickup-reminder-box compact-reminder">
                  <ShieldCheck size={22} />
                  <div>
                    <strong>Documents still required</strong>
                    <span>Payment does not complete pickup approval. Keep a driver license on file and upload insurance for this rental.</span>
                  </div>
                </div>
              )}
              <button className="primary-btn" onClick={runTestStripePayment} disabled={paymentSaving || paymentPaid}>
                {paymentPaid ? 'Payment Complete' : paymentSaving ? 'Checking Payment...' : 'Waiting For Admin Test Payment'}
              </button>
            </div>
          )}

          {wizardStep === 4 && (
            <div>
              <p className="muted">
                {licenseUploaded
                  ? 'Your driver license is already on file for future rentals. Replace it here if Rent Me CT asks for a new copy.'
                  : 'Upload a clear driver license image or PDF once. Rent Me CT can reuse it for returning rentals.'}
              </p>
              {licenseUploaded ? (
                <div className="wizard-upload-complete">
                  <CheckCircle2 size={20} />
                  <div>
                    <strong>Driver license uploaded</strong>
                    <span>It is on file. Upload insurance next if this rental still needs it.</span>
                  </div>
                </div>
              ) : (
                <label className="secondary-btn">
                  Upload Driver License
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => uploadDocument(e, 'license')}
                    style={{ display: 'none' }}
                  />
                </label>
              )}
            </div>
          )}

          {wizardStep === 5 && (
            <div>
              <p className="muted">
                {insuranceUploaded
                  ? 'Insurance is uploaded for this rental. Rent Me CT will review it before vehicle release.'
                  : 'Upload proof of active auto insurance. Rent Me CT must have insurance on file before pickup.'}
              </p>
              {insuranceUploaded ? (
                <div className="wizard-upload-complete">
                  <CheckCircle2 size={20} />
                  <div>
                    <strong>Insurance uploaded</strong>
                    <span>This guided step is complete.</span>
                  </div>
                </div>
              ) : (
                <label className="secondary-btn">
                  Upload Insurance
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => uploadDocument(e, 'insurance')}
                    style={{ display: 'none' }}
                  />
                </label>
              )}
            </div>
          )}
        </div>

        <div className="wizard-actions">
          <button
            className="secondary-btn"
            onClick={skipWizardStep}
            disabled={wizardStep === 0 && !phoneVerified}
          >
            Skip For Now
          </button>
          <button className="secondary-btn" onClick={() => setWizardOpen(false)}>Cancel</button>
          <button
            className="primary-btn"
            onClick={nextWizardStep}
            disabled={wizardStep === 0 && !phoneVerified}
          >
            {wizardStep === 0 && !phoneVerified
              ? 'Verify Phone First'
              : wizardStep === wizardSteps.length - 1
                ? 'Finish'
                : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AgreementModal({
  agreementText,
  agreementChecked,
  setAgreementChecked,
  signatureName,
  setSignatureName,
  signAgreement,
  agreementSaving,
  onClose,
}) {
  return (
    <div className="modal-backdrop">
      <div className="agreement-modal">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Rental Agreement</p>
            <h2>Review & Sign</h2>
          </div>
          <button className="wizard-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="agreement-scroll-box">
          <pre>{agreementText}</pre>
        </div>

        <div className="agreement-sign-box">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={agreementChecked}
              onChange={(e) => setAgreementChecked(e.target.checked)}
            />
            I have read and agree to the rental agreement.
          </label>

          <input
            className="signature-input"
            placeholder="Type full legal name as signature"
            value={signatureName}
            onChange={(e) => setSignatureName(e.target.value)}
          />

          <div className="button-row end-row">
            <button className="secondary-btn" onClick={onClose}>Cancel</button>
            <button className="primary-btn" onClick={signAgreement} disabled={agreementSaving}>
              <FileSignature size={17} /> {agreementSaving ? 'Signing...' : 'Sign Agreement'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="road"><div className="loading-car">▰</div></div>
      <h1>Getting your rental ready...</h1>
    </div>
  );
}

function Notice({ notice, onDismiss }) {
  return (
    <div className={`notice-banner ${notice.type || 'info'}`}>
      <span>{notice.text}</span>
      <button type="button" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}

function MobileFlowStatus({ items }) {
  if (!items?.length) return null;

  return (
    <section className="mobile-flow-status" aria-label="Rental status">
      {items.map((item) => (
        <div className={`mobile-flow-card ${item.tone || 'info'}`} key={item.key}>
          <strong>{item.title}</strong>
          <span>{item.text}</span>
        </div>
      ))}
    </section>
  );
}

function AuthScreen({
  authMode,
  setAuthMode,
  authForm,
  setAuthForm,
  handleAuth,
  handleForgotPassword,
  message,
  checkoutIntent,
  pendingVehicleName,
  reservationForm
}) {
  const isSignUp = authMode === 'sign-up';
  const update = (key, value) => setAuthForm({ ...authForm, [key]: value });

  return (
    <div className="auth-screen">
      <div className="auth-left">
        <p className="eyebrow">Rent Me CT</p>
        <h1>{checkoutIntent ? 'Finish your reservation.' : 'Premium rentals with a smarter client portal.'}</h1>
        <p>
          {checkoutIntent
            ? 'Create an account or sign in to continue. Your selected dates and vehicle will stay attached to this checkout.'
            : 'Sign in or create an account to continue your rental, upload documents, sign your agreement, and complete payment.'}
        </p>
        {checkoutIntent && (
          <div className="agreement-status-box">
            <Car size={24} />
            <div>
              <strong>{pendingVehicleName || 'Vehicle selected from website'}</strong>
              <span>
                {reservationForm.pickupDate && reservationForm.returnDate
                  ? `${reservationForm.pickupDate} to ${reservationForm.returnDate}`
                  : 'Rental dates saved from website'}
              </span>
            </div>
          </div>
        )}
      </div>

      <form className="auth-card" onSubmit={handleAuth}>
        <h2>{checkoutIntent ? (isSignUp ? 'Create Account to Continue' : 'Sign In to Continue') : (isSignUp ? 'Create Account' : 'Client Login')}</h2>

        {isSignUp && (
          <input
            placeholder="Full legal name"
            value={authForm.fullName}
            onChange={(e) => update('fullName', e.target.value)}
            required
          />
        )}

        <input
          type="email"
          placeholder="Email"
          value={authForm.email}
          onChange={(e) => update('email', e.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Password"
          value={authForm.password}
          onChange={(e) => update('password', e.target.value)}
          required
        />

        {isSignUp && (
          <input
            placeholder="Phone number"
            value={authForm.phone}
            onChange={(e) => update('phone', e.target.value)}
            required
          />
        )}

        {isSignUp && (
          <input
            placeholder="Home address"
            value={authForm.address}
            onChange={(e) => update('address', e.target.value)}
            required
          />
        )}

        {isSignUp && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={authForm.billingSame}
              onChange={(e) => update('billingSame', e.target.checked)}
            />
            Billing address is the same as home address
          </label>
        )}

        <button className="primary-btn" type="submit">
          {checkoutIntent ? (isSignUp ? 'Continue Reservation' : 'Continue Reservation') : (isSignUp ? 'Create Account' : 'Sign In')}
        </button>

        {!isSignUp && (
        <button
          className="link-btn"
          type="button"
          onClick={handleForgotPassword}
        >
          Forgot password?
        </button>
      )}
        {message && <p className="auth-message">{message}</p>}

        <button
          className="link-btn"
          type="button"
          onClick={() => setAuthMode(isSignUp ? 'sign-in' : 'sign-up')}
        >
          {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Create one'}
        </button>
      </form>
    </div>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || 'Pending'}</strong>
    </div>
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="metric-card">
      <Icon size={22} />
      <span>{label}</span>
      <strong>{value || 'Pending'}</strong>
    </div>
  );
}

function ChecklistItem({ icon: Icon, title, status, completed, onOpen }) {
  return (
    <div className={completed ? 'check-item complete' : 'check-item'}>
      <Icon size={20} />
      <div>
        <strong>{title}</strong>
        <span>{status}</span>
      </div>
      {completed ? <CheckCircle2 size={20} /> : <button type="button" onClick={onOpen}>Open</button>}
    </div>
  );
}

function UploadCard({ icon: Icon, title, text, onUpload }) {
  return (
    <div className="panel action-card">
      <Icon size={28} />
      <h3>{title}</h3>
      <p className="muted">{text}</p>
      <label className="secondary-btn">
        Start
        <input
          type="file"
          accept="image/*,.pdf"
          onChange={onUpload}
          style={{ display: 'none' }}
        />
      </label>
    </div>
  );
}

function DocumentRequirementNotice({
  licenseUploaded,
  insuranceUploaded,
  licenseRejected,
  insuranceRejected,
}) {
  const rejected = licenseRejected || insuranceRejected;
  const missing = [
    !licenseUploaded ? 'driver license' : '',
    !insuranceUploaded ? 'insurance for this rental' : '',
  ].filter(Boolean);

  return (
    <div className={rejected ? 'pickup-reminder-box rejected' : 'pickup-reminder-box'}>
      <ShieldCheck size={22} />
      <div>
        <strong>{rejected ? 'Document replacement required' : 'Required before pickup'}</strong>
        <span>
          {rejected
            ? `Rent Me CT rejected ${[
              licenseRejected ? 'the saved driver license' : '',
              insuranceRejected ? 'this rental insurance upload' : '',
            ].filter(Boolean).join(' and ')}. Upload a replacement before vehicle release.`
            : `Upload ${missing.join(' and ')} before Rent Me CT can release the vehicle.`}
        </span>
      </div>
    </div>
  );
}

function ActionCard({ icon: Icon, title, text, onClick }) {
  return (
    <div className="panel action-card">
      <Icon size={28} />
      <h3>{title}</h3>
      <p className="muted">{text}</p>
      <button className="secondary-btn" onClick={onClick}>Start</button>
    </div>
  );
}

function UploadedDocuments({ documents, currentRental, openDocument, replaceDocument }) {
  const sortedDocuments = [...documents].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  return (
    <section className="panel uploaded-documents-panel">
      <p className="eyebrow">Uploaded Documents</p>
      <h3>Review Or Replace Files</h3>
      {!currentRental && <p className="muted">Create a reservation first. Insurance is tied to each rental; your driver license can stay on file.</p>}
      {currentRental && sortedDocuments.length === 0 && <p className="muted">No documents uploaded for this rental yet.</p>}
      <div className="uploaded-document-list">
        {sortedDocuments.map((document) => (
          <div className="uploaded-document-row" key={document.id}>
            <div>
              <strong>{documentTypeLabel(document.document_type)}</strong>
              <span>{prettyStatus(document.status || 'pending_review')} • {document.created_at ? new Date(document.created_at).toLocaleString() : 'Recently uploaded'}</span>
            </div>
            <div className="document-actions">
              <button className="secondary-btn" type="button" onClick={() => openDocument(document)}>
                <FileText size={16} /> Open
              </button>
              <label className="secondary-btn">
                <Upload size={16} /> Replace
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(event) => replaceDocument(event, document)}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function normalizeUSPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  if (String(phone || '').trim().startsWith('+')) {
    return String(phone).trim();
  }

  return phone;
}

function getRentalDays(start, end) {
  const pickup = new Date(`${start}T00:00:00`);
  const dropoff = new Date(`${end}T00:00:00`);
  return Math.ceil((dropoff - pickup) / (1000 * 60 * 60 * 24));
}

function getRentalDaysSafe(start, end) {
  if (!start || !end) return 'Pending';
  const days = getRentalDays(start, end);
  return days > 0 ? `${days} days` : 'Invalid';
}

function getTodayDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getNextDateInputValue(value) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return getTodayDateInputValue(date);
}

function money(value) {
  const num = Number(value || 0);
  return num.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function formatRentalDate(date, time) {
  if (!date) return 'Pending';
  const formatted = new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${formatted}${time ? ` ${time}` : ''}`;
}

function vehicleImageKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&amp;/g, 'and')
    .replace(/mercedes benz/g, 'mercedes')
    .replace(/benz/g, 'mercedes')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

const VEHICLE_IMAGES_BY_KEY = Object.fromEntries(
  Object.entries(VEHICLE_IMAGE_MODULES).map(([path, url]) => {
    const filename = path.split('/').pop()?.replace(/\.[^.]+$/, '') || '';
    return [vehicleImageKey(filename), url];
  })
);

function getVehicleImage(vehicle) {
  const imageKey = vehicleImageKey(vehicle?.name);
  if (VEHICLE_IMAGES_BY_KEY[imageKey]) return VEHICLE_IMAGES_BY_KEY[imageKey];

  const fallbackKey = Object.keys(VEHICLE_IMAGES_BY_KEY).find((key) =>
    imageKey.includes(key) || key.includes(imageKey)
  );

  return fallbackKey ? VEHICLE_IMAGES_BY_KEY[fallbackKey] : Object.values(VEHICLE_IMAGES_BY_KEY)[0];
}

function parseRentalDateTime(date, time) {
  if (!date) return null;
  const normalizedTime = convertTo24HourTime(time || '11:59 PM');
  return new Date(`${date}T${normalizedTime}:00`);
}

function convertTo24HourTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return '23:59';
  let hour = Number(match[1]);
  const minute = match[2] || '00';
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

function getReturnCountdown(date, time, now = Date.now()) {
  const due = parseRentalDateTime(date, time);
  if (!due) return { label: 'No Active Return Due', value: 'Pending', canConfirm: false };

  const ms = due.getTime() - now;
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  const minutes = Math.floor((abs % 3600000) / 60000);
  const value = days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;

  if (ms <= 0) return { label: 'Return Is Due', value: ms < 0 ? `${value} overdue` : 'Due now', canConfirm: true };
  return { label: 'Return Countdown', value, canConfirm: false };
}

function getExtensionRequestWindow(rental, now = Date.now()) {
  if (!rental?.id) return { open: false, message: 'Extensions open after a rental is active.' };

  const status = String(rental.status || '').toLowerCase();
  if (!['active', 'overdue'].includes(status)) {
    return { open: false, message: 'Extensions open after the rental is active and within 24 hours of return.' };
  }

  const due = parseRentalDateTime(rental.return_date, rental.return_time);
  if (!due) return { open: false, message: 'Return time is missing for this rental.' };

  if (now < due.getTime() - 86400000) {
    return { open: false, message: 'Extension requests open 24 hours before the booked return time.' };
  }

  return { open: true, message: '' };
}

function prettyStatus(status) {
  const map = {
    none: 'No Active Rental',
    pending: 'Pending',
    pending_setup: 'Pending Setup',
    documents_needed: 'Documents Needed',
    document_review: 'Document Review',
    approved: 'Approved',
    active: 'Active',
    overdue: 'Overdue',
    completed: 'Completed',
    cancelled: 'Cancelled',
    'pending setup': 'Pending Setup',
  };

  return map[status] || status;
}

function latestDocument(documents, type) {
  return documents
    .filter((doc) => doc.document_type === type)
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))[0];
}

function isUsableDocument(document) {
  return Boolean(document && document.status !== 'rejected');
}

function isApprovedDocument(document) {
  return document?.status === 'approved';
}

function documentTypeLabel(type) {
  const map = {
    license: 'Driver license',
    insurance: 'Insurance policy',
  };

  return map[type] || type;
}

function extensionStatusTitle(request) {
  if (!request) return 'No extension request';
  const kind = request.request_kind === 'switch_car_continuation' ? 'Switch request' : 'Extension request';

  if (request.status === 'pending') return `${kind} pending`;
  if (request.status === 'approved_pending_payment') return `${kind} approved`;
  if (request.status === 'activated') return `${kind} active`;
  if (request.status === 'rejected') return `${kind} declined`;
  if (request.status === 'cancelled') return `${kind} cancelled`;
  return prettyStatus(request.status);
}

function extensionStatusText(request) {
  if (!request) return '';
  const requestedReturn = formatRentalDate(request.requested_return_date, request.requested_return_time);

  if (request.status === 'pending') {
    return `Rent Me CT is reviewing your request through ${requestedReturn}.`;
  }

  if (request.status === 'approved_pending_payment') {
    return request.request_kind === 'switch_car_continuation'
      ? `Approved through ${requestedReturn}. Payment is required before the replacement vehicle activates.`
      : `Approved through ${requestedReturn}. Payment is required before the new return time activates.`;
  }

  if (request.status === 'activated') {
    return request.request_kind === 'switch_car_continuation'
      ? 'Payment is recorded. Your replacement rental is available in this portal.'
      : `Payment is recorded. Your active return window is now ${requestedReturn}.`;
  }

  if (request.status === 'rejected') {
    return request.admin_note || 'Rent Me CT could not approve this request. Choose another option or message us.';
  }

  if (request.status === 'cancelled') {
    return 'This request was cancelled. You can submit a new request when the extension window is open.';
  }

  return prettyStatus(request.status);
}

function timeOptions() {
  const times = [];
  for (let hour = 9; hour <= 21; hour++) {
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour;
    times.push(`${displayHour}:00 ${suffix}`);
  }
  return times;
}


function isVehicleBookable(vehicle) {
  const status = String(vehicle?.status || 'available').toLowerCase();
  return !['reserved', 'rented', 'maintenance', 'unavailable'].includes(status);
}

function prettyVehicleStatus(status) {
  const normalized = String(status || 'available').toLowerCase();
  if (normalized === 'available') return 'Available';
  if (normalized === 'reserved') return 'Reserved';
  if (normalized === 'rented') return 'Rented';
  if (normalized === 'maintenance') return 'Maintenance';
  if (normalized === 'unavailable') return 'Unavailable';
  return 'Unavailable';
}

function vehicleAvailabilityLabel(vehicle, reservation, rentals = [], currentRentalId = '') {
  const status = String(vehicle?.status || 'available').toLowerCase();
  if (BLOCKING_VEHICLE_STATUSES.includes(status) || ['reserved', 'rented'].includes(status)) {
    return prettyVehicleStatus(status);
  }

  if (!reservation?.pickupDate || !reservation?.returnDate) {
    return 'Choose dates to confirm';
  }

  const conflictingRental = rentals.find((rental) =>
    rental.id !== currentRentalId &&
    rental.vehicle_id === vehicle?.id &&
    BLOCKING_RENTAL_STATUSES.includes(rental.status) &&
    rentalPeriodsOverlap(reservation, rental)
  );

  return conflictingRental ? 'Unavailable for dates' : 'Available';
}

function normalizeVehicleName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/mercedes benz/g, 'mercedes')
    .replace(/benz/g, 'mercedes')
    .replace(/\s+/g, ' ')
    .trim();
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const buffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isVehicleAvailableForDates(vehicle, reservation, rentals = [], currentRentalId = '') {
  const status = String(vehicle?.status || 'available').toLowerCase();
  if (BLOCKING_VEHICLE_STATUSES.includes(status)) return false;

  if (!reservation?.pickupDate || !reservation?.returnDate) {
    return !['reserved', 'rented'].includes(status);
  }

  return !rentals.some((rental) =>
	    rental.id !== currentRentalId &&
	    rental.vehicle_id === vehicle?.id &&
	    BLOCKING_RENTAL_STATUSES.includes(rental.status) &&
	    rentalPeriodsOverlap(reservation, rental)
	  );
}

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

function buildAgreementWithDetails({ agreementText, profile, email, vehicle, reservation, rental }) {
  const details = `
AUTO-FILLED RENTAL DETAILS

Agreement Version: ${AGREEMENT_VERSION}
Signed Snapshot Generated: ${new Date().toISOString()}

Renter Name: ${profile?.full_name || 'Pending'}
Address: ${profile?.address || 'Pending'}
Phone: ${profile?.phone || 'Pending'}
Email: ${email || 'Pending'}

Vehicle: ${vehicle?.name || 'Pending'}
Make: ${vehicle?.brand || vehicle?.make || 'Pending'}
Model: ${vehicle?.model || 'Pending'}
Year: ${vehicle?.year || 'Pending'}
VIN: ${vehicle?.vin || 'Pending'}
License Plate: ${vehicle?.plate_number || vehicle?.license_plate || 'Pending'}

Pickup Date/Time: ${formatRentalDate(reservation?.pickupDate, reservation?.pickupTime)}
Return Date/Time: ${formatRentalDate(reservation?.returnDate, reservation?.returnTime)}
Return Location: ${RENTMECT_ADDRESS}

Daily Rate: ${vehicle?.daily_rate ? money(vehicle.daily_rate) : 'Pending'}
Rental Total: ${rental?.rental_total ? money(rental.rental_total) : 'Pending'}
Tax Amount: ${rental?.tax_amount ? money(rental.tax_amount) : 'Pending'}
Security Deposit: ${rental?.security_deposit ? money(rental.security_deposit) : vehicle?.security_deposit ? money(vehicle.security_deposit) : 'Pending'}
Mileage Policy: ${MILEAGE_POLICY}
Cancellation Terms: ${CANCELLATION_TERMS}

------------------------------------------------------------
`;

  return `${details}\n${agreementText}`;
}

createRoot(document.getElementById('root')).render(<App />);
