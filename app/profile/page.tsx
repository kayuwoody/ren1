'use client';

import { useEffect, useState } from 'react';

export default function ProfilePage() {
  const [customer, setCustomer] = useState<any>(null);

  useEffect(() => {
    fetch('/api/session')
      .then(res => res.json())
      .then(data => {
        if (data.userId) {
          fetch(`/api/profile?id=${data.userId}`)
            .then(res => res.json())
            .then(setCustomer)
            .catch(console.error);
        }
      })
      .catch(console.error);
  }, []);

  if (!customer) {
    return <div className="p-4">No profile info found.</div>;
  }

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Your Profile</h1>
      <p><strong>Name:</strong> {customer.name || '-'}</p>
      <p><strong>Email:</strong> {customer.email || '-'}</p>
      <p><strong>Phone:</strong> {customer.phone || '-'}</p>
    </div>
  );
}
