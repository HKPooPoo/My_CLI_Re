<?php

use App\Restaurant\Controllers\RestaurantOrderController;
use App\Restaurant\Controllers\RestaurantBranchController;
use App\Restaurant\Controllers\RestaurantDelivererController;
use Illuminate\Support\Facades\Route;

Route::get('/branches', [RestaurantBranchController::class, 'index']);
Route::post('/branches', [RestaurantBranchController::class, 'store']);
Route::post('/branches/auth', [RestaurantBranchController::class, 'authenticate']);
Route::post('/distance', [RestaurantOrderController::class, 'distance']);
Route::get('/orders', [RestaurantOrderController::class, 'index']);
Route::post('/orders', [RestaurantOrderController::class, 'store']);
Route::post('/orders/checkout', [RestaurantOrderController::class, 'createCheckout']);
Route::get('/orders/pickup/{code}', [RestaurantOrderController::class, 'showByPickupCode']);
Route::get('/orders/deliverer/{delivererId}', [RestaurantOrderController::class, 'listByDeliverer']);
Route::get('/orders/{orderNumber}', [RestaurantOrderController::class, 'show']);
Route::patch('/orders/{orderNumber}/status', [RestaurantOrderController::class, 'updateStatus']);
Route::delete('/orders', [RestaurantOrderController::class, 'clearOrders']);

Route::get('/deliverers', [RestaurantDelivererController::class, 'index']);
Route::post('/deliverers', [RestaurantDelivererController::class, 'store']);
Route::post('/deliverers/auth', [RestaurantDelivererController::class, 'authenticate']);
Route::post('/deliverers/logout', [RestaurantDelivererController::class, 'logout']);
Route::get('/deliverers/me', [RestaurantDelivererController::class, 'me']);
Route::patch('/deliverers/{id}/status', [RestaurantDelivererController::class, 'updateStatus']);
Route::delete('/deliverers/{id}', [RestaurantDelivererController::class, 'destroy']);
