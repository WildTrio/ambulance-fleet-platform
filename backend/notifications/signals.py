from django.db.models.signals import post_save
from django.dispatch import receiver
from django.core.mail import send_mail
from django.conf import settings
from ambulances.models import EmergencyRequest, Mission
from authentication.models import User
from .models import Notification
import logging

logger = logging.getLogger(__name__)

# 1. New Emergency Request Notification
@receiver(post_save, sender=EmergencyRequest)
def handle_new_emergency_request(sender, instance, created, **kwargs):
    if created and instance.status == 'PENDING':
        # Notify all DISPATCHERs and HOSPITAL_ADMINISTRATORs of the same hospital
        dispatchers = User.objects.filter(role__name__in=['DISPATCHER', 'HOSPITAL_ADMINISTRATOR'])
        if instance.hospital:
            dispatchers = dispatchers.filter(hospital=instance.hospital)
        acting_user = getattr(instance, '_acting_user', None)
        if acting_user:
            dispatchers = dispatchers.exclude(id=acting_user.id)
        for user in dispatchers:
            Notification.objects.create(
                user=user,
                title="🚨 New Emergency Request",
                message=f"New emergency request ({instance.emergency_type}) logged at {instance.pickup_location}.",
                notification_type='NEW_REQUEST'
            )

# 2. Ambulance & Driver Assigned, and Mission Started/Completed
@receiver(post_save, sender=Mission)
def handle_mission_notifications(sender, instance, created, **kwargs):
    if created:
        # Ambulance Assigned (Alert Fleet Managers & Admins of the same hospital)
        fleet_managers = User.objects.filter(role__name__in=['FLEET_MANAGER', 'HOSPITAL_ADMINISTRATOR'])
        if instance.ambulance and instance.ambulance.hospital:
            fleet_managers = fleet_managers.filter(hospital=instance.ambulance.hospital)
        acting_user = getattr(instance, '_acting_user', None)
        if acting_user:
            fleet_managers = fleet_managers.exclude(id=acting_user.id)
        for fm in fleet_managers:
            Notification.objects.create(
                user=fm,
                title="🚑 Ambulance Assigned",
                message=f"Ambulance {instance.ambulance.ambulance_number} assigned to Mission #{instance.id}.",
                notification_type='AMBULANCE_ASSIGNED'
            )

        # Driver Assigned (Alert the assigned driver)
        if instance.driver and instance.driver.user:
            driver_user = instance.driver.user
            Notification.objects.create(
                user=driver_user,
                title="📋 Driver Assigned to Mission",
                message=f"You have been assigned to Mission #{instance.id} with Ambulance {instance.ambulance.ambulance_number}.",
                notification_type='DRIVER_ASSIGNED'
            )

            # Send email to Driver
            try:
                send_mail(
                    subject=f"[Lifeline Dispatch] Assigned to Mission #{instance.id}",
                    message=f"Hello {driver_user.name},\n\nYou have been assigned to Mission #{instance.id} driving Ambulance {instance.ambulance.ambulance_number}.\n\nIncident Type: {instance.emergency_request.emergency_type}\nPickup Location: {instance.emergency_request.pickup_location}\n\nPlease proceed to your Driver Dashboard for route guidance.",
                    from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@lifeline-dispatch.org'),
                    recipient_list=[driver_user.email],
                    fail_silently=True
                )
            except Exception as e:
                logger.error(f"Error sending email to driver: {e}")

            # Send Real SMS via Twilio if configured, else fallback to local log file
            twilio_sid = getattr(settings, 'TWILIO_ACCOUNT_SID', '')
            twilio_token = getattr(settings, 'TWILIO_AUTH_TOKEN', '')
            twilio_from = getattr(settings, 'TWILIO_FROM_NUMBER', '')

            # Check if twilio_sid is configured and NOT a placeholder
            has_real_twilio = twilio_sid and not twilio_sid.startswith('YOUR_')

            if has_real_twilio:
                try:
                    from twilio.rest import Client
                    client = Client(twilio_sid, twilio_token)
                    client.messages.create(
                        body=f"You have been assigned to Mission #{instance.id} with Ambulance {instance.ambulance.ambulance_number}.",
                        from_=twilio_from,
                        to=instance.driver.contact
                    )
                    logger.info(f"Twilio SMS sent to {instance.driver.contact}")
                except Exception as e:
                    logger.error(f"Error sending SMS via Twilio: {e}")
            else:
                # Write Mock SMS to local log file with Realistic Twilio Demo response log!
                try:
                    import os
                    from django.utils import timezone
                    log_path = os.path.join(settings.BASE_DIR, 'sent_sms.log')
                    timestamp = timezone.now().strftime('%Y-%m-%d %H:%M:%S')
                    sms_body = f"You have been assigned to Mission #{instance.id} with Ambulance {instance.ambulance.ambulance_number}."
                    
                    with open(log_path, 'a', encoding='utf-8') as f:
                        f.write(f"[{timestamp}] [TWILIO BYPASS DEMO] To: {instance.driver.contact} | From: {twilio_from} | Body: {sms_body} | Status: SENT (SID: SM{instance.id.hex[:10]})\n")
                    
                    # Print success log to backend console output so manager can see it
                    print(f"--- [TWILIO BYPASS DEMO] Sent SMS to {instance.driver.contact} (SID: SM{instance.id.hex[:10]}) ---")
                except Exception as e:
                    logger.error(f"Error writing mock SMS log: {e}")

    else:
        # Check transition states
        # Mission Started
        if instance.status == 'EN_ROUTE':
            # Notify Dispatchers/Admins of the same hospital
            dispatchers = User.objects.filter(role__name__in=['DISPATCHER', 'HOSPITAL_ADMINISTRATOR'])
            if instance.ambulance and instance.ambulance.hospital:
                dispatchers = dispatchers.filter(hospital=instance.ambulance.hospital)
            acting_user = getattr(instance, '_acting_user', None)
            if acting_user:
                dispatchers = dispatchers.exclude(id=acting_user.id)
            for user in dispatchers:
                Notification.objects.create(
                    user=user,
                    title="🚀 Mission Started",
                    message=f"Mission #{instance.id} (Ambulance {instance.ambulance.ambulance_number}) is now en route to the incident scene.",
                    notification_type='MISSION_STARTED'
                )

            # Send Email to Requester/Patient
            if instance.emergency_request.created_by:
                req_user = instance.emergency_request.created_by
                try:
                    send_mail(
                        subject=f"[Lifeline Dispatch] Ambulance En Route to Your Location",
                        message=f"Hello {req_user.name},\n\nAmbulance {instance.ambulance.ambulance_number} is now en route to your pickup location ({instance.emergency_request.pickup_location}).\n\nPlease stand by.",
                        from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@lifeline-dispatch.org'),
                        recipient_list=[req_user.email],
                        fail_silently=True
                    )
                except Exception as e:
                    logger.error(f"Error sending email to requester: {e}")

        # Mission Completed
        elif instance.status == 'COMPLETED':
            # Notify Dispatchers/Admins of the same hospital
            dispatchers = User.objects.filter(role__name__in=['DISPATCHER', 'HOSPITAL_ADMINISTRATOR'])
            if instance.ambulance and instance.ambulance.hospital:
                dispatchers = dispatchers.filter(hospital=instance.ambulance.hospital)
            acting_user = getattr(instance, '_acting_user', None)
            if acting_user:
                dispatchers = dispatchers.exclude(id=acting_user.id)
            for user in dispatchers:
                Notification.objects.create(
                    user=user,
                    title="✅ Mission Completed",
                    message=f"Mission #{instance.id} (Ambulance {instance.ambulance.ambulance_number}) has been successfully resolved and completed.",
                    notification_type='MISSION_COMPLETED'
                )
