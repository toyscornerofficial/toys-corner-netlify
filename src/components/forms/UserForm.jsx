import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { createUser, updateUser } from '../../services/userService';

export default function UserForm({ user, onSaved, onCancel }) {
  const isEdit = Boolean(user);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: user
      ? { name: user.name, email: user.email, role: user.role, password: '' }
      : { name: '', email: '', role: 'Staff', password: '' },
  });

  const onSubmit = async (values) => {
    try {
      if (isEdit) {
        const payload = { userId: user.id, name: values.name, role: values.role };
        if (values.email !== user.email) payload.email = values.email;
        if (values.password) payload.password = values.password;
        await updateUser(payload);
        toast.success('User updated.');
      } else {
        await createUser(values);
        toast.success('User created.');
      }
      onSaved();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to save user.');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="mb-3">
        <label className="form-label small fw-semibold">Name</label>
        <input
          className={`form-control ${errors.name ? 'is-invalid' : ''}`}
          {...register('name', { required: 'Required' })}
        />
        {errors.name && <div className="invalid-feedback">{errors.name.message}</div>}
      </div>

      <div className="mb-3">
        <label className="form-label small fw-semibold">Email</label>
        <input
          type="email"
          className={`form-control ${errors.email ? 'is-invalid' : ''}`}
          {...register('email', { required: 'Required' })}
        />
        {errors.email && <div className="invalid-feedback">{errors.email.message}</div>}
      </div>

      <div className="mb-3">
        <label className="form-label small fw-semibold">
          Password {isEdit && <span className="text-secondary fw-normal">(leave blank to keep unchanged)</span>}
        </label>
        <div className="input-group">
          <input
            type={showPassword ? 'text' : 'password'}
            className={`form-control ${errors.password ? 'is-invalid' : ''}`}
            autoComplete="new-password"
            {...register('password', {
              required: isEdit ? false : 'Required',
              minLength: { value: 6, message: 'At least 6 characters' },
            })}
          />
          <button type="button" className="btn btn-outline-secondary" onClick={() => setShowPassword((v) => !v)} tabIndex={-1}>
            <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
          </button>
          {errors.password && <div className="invalid-feedback">{errors.password.message}</div>}
        </div>
      </div>

      <div className="mb-3">
        <label className="form-label small fw-semibold">Role</label>
        <select className="form-select" {...register('role', { required: true })}>
          <option value="Admin">Admin</option>
          <option value="Staff">Staff</option>
        </select>
        <div className="text-secondary" style={{ fontSize: '0.7rem' }}>
          Admin sees everything (financials, all Reports tabs). Staff has a limited Dashboard/Reports view.
        </div>
      </div>

      <div className="d-flex justify-content-end gap-2 mt-4">
        <button type="button" className="btn btn-light" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn text-white fw-semibold" style={{ background: '#4F46E5' }} disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isEdit ? 'Update' : 'Create User'}
        </button>
      </div>
    </form>
  );
}
