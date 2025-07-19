import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from settings import settings
import logging

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        self.smtp_server = settings.SMTP_SERVER
        self.smtp_port = settings.SMTP_PORT
        self.smtp_username = settings.SMTP_USERNAME
        self.smtp_password = settings.SMTP_PASSWORD
        self.from_email = settings.FROM_EMAIL
        self.from_name = settings.FROM_NAME

    def send_email(self, to_email, subject, html_content, text_content=None):
        """Send an email"""
        try:
            # Create message
            msg = MIMEMultipart('alternative')
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email
            msg['Subject'] = subject

            # Add text and HTML parts
            if text_content:
                text_part = MIMEText(text_content, 'plain')
                msg.attach(text_part)
            
            html_part = MIMEText(html_content, 'html')
            msg.attach(html_part)

            # Send email
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                if self.smtp_username and self.smtp_password:
                    server.login(self.smtp_username, self.smtp_password)
                server.send_message(msg)
            
            logger.info(f"Email sent successfully to {to_email}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            return False

    def format_price_range(self, price_display):
        if isinstance(price_display, str) and '-' in price_display:
            parts = price_display.split('-')
            try:
                return f"₦{int(parts[0]):,} - ₦{int(parts[1]):,}"
            except Exception:
                return price_display
        try:
            return f"₦{int(price_display):,}"
        except Exception:
            return price_display

    def send_viewing_booking_notification(self, agent_email, agent_name, booking_data, listing_data):
        """Send viewing booking notification to agent"""
        subject = f"New Property Inspection Request - {listing_data['title']}"
        formatted_price = self.format_price_range(listing_data.get('price', 0))
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f8fafc; padding: 20px; border-radius: 0 0 8px 8px; }}
                .property-info {{ background: white; padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #2563eb; }}
                .viewer-info {{ background: white; padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #10b981; }}
                .cta {{ text-align: center; margin: 20px 0; }}
                .btn {{ display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px; }}
                .footer {{ text-align: center; margin-top: 20px; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>New Property Inspection Request</h1>
                </div>
                <div class="content">
                    <p>Hello {agent_name},</p>
                    <p>You have received a new property inspection request. Please review the details below:</p>
                    
                    <div class="property-info">
                        <h3>Property Details</h3>
                        <p><strong>Title:</strong> {listing_data['title']}</p>
                        <p><strong>Location:</strong> {listing_data.get('area', '')}, {listing_data.get('city', '')}, {listing_data.get('state', '')}</p>
                        <p><strong>Price:</strong> {formatted_price}/year</p>
                    </div>
                    
                    <div class="viewer-info">
                        <h3>Renter Information</h3>
                        <p><strong>Name:</strong> {booking_data['viewer_name']}</p>
                        <p><strong>Email:</strong> {booking_data['viewer_email']}</p>
                        <p><strong>Phone:</strong> {booking_data['viewer_phone']}</p>
                        <p><strong>Preferred Date:</strong> {booking_data['preferred_date']}</p>
                        <p><strong>Preferred Time:</strong> {booking_data['preferred_time']}</p>
                        {booking_data.get('alternative_date') and f"<p><strong>Alternative Date:</strong> {booking_data['alternative_date']}</p>" or ""}
                        {booking_data.get('alternative_time') and f"<p><strong>Alternative Time:</strong> {booking_data['alternative_time']}</p>" or ""}
                        {booking_data.get('special_requirements') and f"<p><strong>Special Requirements:</strong> {booking_data['special_requirements']}</p>" or ""}
                    </div>
                    
                    <div class="cta">
                        <a href="http://localhost:5173/agent/dashboard" class="btn">View in Dashboard</a>
                    </div>
                    
                    <p>Please contact the renter to confirm the appointment and provide any additional information they may need.</p>
                    
                    <p>Best regards,<br>The CasaLinger Team</p>
                </div>
                <div class="footer">
                    <p>This is an automated notification from CasaLinger. Please do not reply to this email.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_content = f"""
        New Property Inspection Request
        
        Hello {agent_name},
        
        You have received a new property tour request for {listing_data['title']}.
        
        Property Details:
        - Title: {listing_data['title']}
        - Location: {listing_data.get('area', '')}, {listing_data.get('city', '')}, {listing_data.get('state', '')}
        - Price: {formatted_price}/year
        
        Viewer Information:
        - Name: {booking_data['viewer_name']}
        - Email: {booking_data['viewer_email']}
        - Phone: {booking_data['viewer_phone']}
        - Preferred Date: {booking_data['preferred_date']}
        - Preferred Time: {booking_data['preferred_time']}
        - Alternative Date: {booking_data.get('alternative_date', 'N/A')}
        - Alternative Time: {booking_data.get('alternative_time', 'N/A')}
        - Special Requirements: {booking_data.get('special_requirements', 'None')}
        
        Please contact the renter to confirm the appointment.
        
        Best regards,
        The CasaLinger Team
        """
        
        return self.send_email(agent_email, subject, html_content, text_content)

    def send_application_notification(self, agent_email, agent_name, application_data, listing_data):
        """Send property application notification to agent"""
        subject = f"New Property Application - {listing_data['title']}"
        formatted_price = self.format_price_range(listing_data.get('price', 0))
        # Safely format monthly income
        try:
            monthly_income_formatted = f"₦{float(application_data['monthly_income']):,.2f}"
        except (ValueError, TypeError):
            monthly_income_formatted = f"₦{application_data['monthly_income']}"
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f8fafc; padding: 20px; border-radius: 0 0 8px 8px; }}
                .property-info {{ background: white; padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #10b981; }}
                .applicant-info {{ background: white; padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #2563eb; }}
                .cta {{ text-align: center; margin: 20px 0; }}
                .btn {{ display: inline-block; padding: 12px 24px; background: #10b981; color: white; text-decoration: none; border-radius: 5px; }}
                .footer {{ text-align: center; margin-top: 20px; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>New Property Application</h1>
                </div>
                <div class="content">
                    <p>Hello {agent_name},</p>
                    <p>You have received a new property application. Please review the details below:</p>
                    
                    <div class="property-info">
                        <h3>Property Details</h3>
                        <p><strong>Title:</strong> {listing_data['title']}</p>
                        <p><strong>Location:</strong> {listing_data.get('area', '')}, {listing_data.get('city', '')}, {listing_data.get('state', '')}</p>
                        <p><strong>Price:</strong> {formatted_price}/year</p>
                    </div>
                    
                    <div class="applicant-info">
                        <h3>Applicant Information</h3>
                        <p><strong>Name:</strong> {application_data['applicant_name']}</p>
                        <p><strong>Email:</strong> {application_data['applicant_email']}</p>
                        <p><strong>Phone:</strong> {application_data['applicant_phone']}</p>
                        <p><strong>Monthly Income:</strong> {monthly_income_formatted}</p>
                        <p><strong>Employment Status:</strong> {application_data['employment_status']}</p>
                        <p><strong>Move-in Date:</strong> {application_data['move_in_date']}</p>
                        <p><strong>Lease Duration:</strong> {application_data['lease_duration']} months</p>
                        {application_data.get('additional_notes') and f"<p><strong>Additional Notes:</strong> {application_data['additional_notes']}</p>" or ""}
                    </div>
                    <div class="cta">
                        <a href="http://localhost:5173/agent/dashboard" class="btn">View in Dashboard</a>
                    </div>
                    <p>Please review this application and contact the applicant to proceed with the rental process.</p>
                    <p>Best regards,<br>The CasaLinger Team</p>
                </div>
                <div class="footer">
                    <p>This is an automated notification from CasaLinger. Please do not reply to this email.</p>
                </div>
            </div>
        </body>
        </html>
        """
        text_content = f"""
        New Property Application
        
        Hello {agent_name},
        
        You have received a new property application for {listing_data['title']}.
        
        Property Details:
        - Title: {listing_data['title']}
        - Location: {listing_data.get('area', '')}, {listing_data.get('city', '')}, {listing_data.get('state', '')}
        - Price: {formatted_price}/year
        
        Applicant Information:
        - Name: {application_data['applicant_name']}
        - Email: {application_data['applicant_email']}
        - Phone: {application_data['applicant_phone']}
        - Monthly Income: {monthly_income_formatted}
        - Employment Status: {application_data['employment_status']}
        - Move-in Date: {application_data['move_in_date']}
        - Lease Duration: {application_data['lease_duration']} months
        - Additional Notes: {application_data.get('additional_notes', 'None')}
        
        Please review this application and contact the applicant.
        
        Best regards,
        The CasaLinger Team
        """
        return self.send_email(agent_email, subject, html_content, text_content)

# Global email service instance
email_service = EmailService()