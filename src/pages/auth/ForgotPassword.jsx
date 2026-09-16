import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';

export default function ForgotPassword() {
  const { resetPasswordRequest } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm();

  const onSubmit = async ({ email }) => {
    const { error } = await resetPasswordRequest(email);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Reset link sent — check your email.');
  };

  return (
    <div
      className="d-flex align-items-center justify-content-center vh-100"
      style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #22C55E 100%)' }}
    >
      <div className="card shadow-lg border-0 p-4" style={{ width: '380px', borderRadius: '16px' }}>
        <h5 className="fw-bold mb-1">Forgot Password</h5>
        <p className="text-secondary small mb-4">
          Enter your email and we'll send you a reset link.
        </p>

        {isSubmitSuccessful ? (
          <div className="alert alert-success small">
            Check your inbox for the reset link.
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="mb-3">
              <label className="form-label small fw-semibold">Email</label>
              <input
                type="email"
                className={`form-control ${errors.email ? 'is-invalid' : ''}`}
                {...register('email', { required: 'Email is required' })}
              />
              {errors.email && (
                <div className="invalid-feedback">{errors.email.message}</div>
              )}
            </div>
            <button
              type="submit"
              className="btn w-100 text-white fw-semibold mb-2"
              style={{ background: '#4F46E5' }}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}

        <div className="text-center mt-2">
          <Link to="/login" className="small">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
