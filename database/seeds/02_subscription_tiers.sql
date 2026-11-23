INSERT INTO subscription_plans(id,name,price_ngn,eligible_roles,interval) VALUES
('passenger_lifetime','Passenger Lifetime',60000,ARRAY['PASSENGER'],'one_time'),
('bus_per_trip','Bus per trip',250,ARRAY['DRIVER','DISPATCHER','PARK_OPERATOR'],'per_trip')
ON CONFLICT(id) DO NOTHING;
