from .models import AuditLog

class UserActivityLoggingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        
        # Log write actions (POST, PUT, DELETE, PATCH) for authenticated users.
        if hasattr(request, 'user') and request.user and request.user.is_authenticated:
            if request.method in ['POST', 'PUT', 'DELETE', 'PATCH']:
                # Exclude login and logout endpoints as they are logged explicitly in views
                if not request.path.startswith('/api/auth/login') and not request.path.startswith('/api/auth/logout'):
                    try:
                        # Retrieve IP and User-Agent
                        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
                        if x_forwarded_for:
                            ip_address = x_forwarded_for.split(',')[0].strip()
                        else:
                            ip_address = request.META.get('REMOTE_ADDR')
                            
                        user_agent = request.META.get('HTTP_USER_AGENT', '')

                        details = {
                            'method': request.method,
                            'path': request.path,
                            'query_params': dict(request.GET.items()),
                            'status_code': response.status_code,
                            'ip_address': ip_address,
                            'user_agent': user_agent
                        }
                        
                        AuditLog.objects.create(
                            user=request.user,
                            action=f"API_{request.method}",
                            details=details
                        )
                    except Exception:
                        pass
        return response
