import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';

export default function ResetPassword() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm();

  const password = watch('password');

  const onSubmit = async ({ password }) => {
    const { error } = await updatePassword(password);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Password updated. Please sign in again.');
    navigate('/login', { replace: true });
  };

  return (
    <div
      className="d-flex align-items-center justify-content-center vh-100"
      style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #22C55E 100%)' }}
    >
      <div className="card shadow-lg border-0 p-4" style={{ width: '380px', borderRadius: '16px' }}>
        <h5 className="fw-bold mb-1">Set New Password</h5>
        <p className="text-secondary small mb-4">Choose a new password for your account.</p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="mb-3">
            <label className="form-label small fw-semibold">New Password</label>
            <input
              type="password"
              className={`form-control ${errors.password ? 'is-invalid' : ''}`}
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 6, message: 'At least 6 characters' },
              })}
            />
            {errors.password && (
              <div className="invalid-feedback">{errors.password.message}</div>
            )}
          </div>

          <div className="mb-3">
            <label className="form-label small fw-semibold">Confirm Password</label>
            <input
              type="password"
              className={`form-control ${errors.confirmPassword ? 'is-invalid' : ''}`}
              {...register('confirmPassword', {
                required: 'Please confirm your password',
                validate: (v) => v === password || 'Passwords do not match',
              })}
            />
            {errors.confirmPassword && (
              <div className="invalid-feedback">{errors.confirmPassword.message}</div>
            )}
          </div>

          <button
            type="submit"
            className="btn w-100 text-white fw-semibold"
            style={{ background: '#4F46E5' }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
