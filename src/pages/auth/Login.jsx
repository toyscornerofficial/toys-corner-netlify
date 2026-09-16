import { useForm } from 'react-hook-form';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm();

  const onSubmit = async ({ email, password, rememberMe }) => {
    const { error } = await login(email, password);

    if (error) {
      toast.error(error.message || 'Login failed. Check your credentials.');
      return;
    }

    // "Remember me" - Supabase persists sessions in localStorage by default.
    // If unchecked, we mark it so the app knows to sign out on tab close.
    if (!rememberMe) {
      sessionStorage.setItem('tc_session_only', '1');
    } else {
      sessionStorage.removeItem('tc_session_only');
    }

    toast.success('Welcome back!');
    const redirectTo = location.state?.from?.pathname || '/dashboard';
    navigate(redirectTo, { replace: true });
  };

  return (
    <div
      className="d-flex align-items-center justify-content-center vh-100"
      style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #22C55E 100%)' }}
    >
      <div className="card shadow-lg border-0 p-4" style={{ width: '380px', borderRadius: '16px' }}>
        <div className="text-center mb-4">
          <div className="fs-2 mb-1">🧸</div>
          <h4 className="fw-bold mb-0">Toys Corner</h4>
          <p className="text-secondary small mb-0">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="mb-3">
            <label className="form-label small fw-semibold">Email</label>
            <input
              type="email"
              className={`form-control ${errors.email ? 'is-invalid' : ''}`}
              placeholder="you@toyscorner.com"
              {...register('email', { required: 'Email is required' })}
            />
            {errors.email && (
              <div className="invalid-feedback">{errors.email.message}</div>
            )}
          </div>

          <div className="mb-3">
            <label className="form-label small fw-semibold">Password</label>
            <input
              type="password"
              className={`form-control ${errors.password ? 'is-invalid' : ''}`}
              placeholder="••••••••"
              {...register('password', { required: 'Password is required' })}
            />
            {errors.password && (
              <div className="invalid-feedback">{errors.password.message}</div>
            )}
          </div>

          <div className="d-flex justify-content-between align-items-center mb-3">
            <div className="form-check">
              <input
                type="checkbox"
                className="form-check-input"
                id="rememberMe"
                {...register('rememberMe')}
              />
              <label className="form-check-label small" htmlFor="rememberMe">
                Remember me
              </label>
            </div>
            <Link to="/forgot-password" className="small">
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            className="btn w-100 text-white fw-semibold"
            style={{ background: '#4F46E5' }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
