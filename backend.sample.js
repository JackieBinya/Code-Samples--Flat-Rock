import mongoose from 'mongoose';

import config from '../../../config';
import constants from '../../../constants';
// const { sendEmail } = require('/opt/nodejs/services/mailer');
// const { orderCreatedEmail } = require('../../email.templates');
import { Order } from '../../../models/Order';
import { Product } from '../../../models/Product';
import {
  ORDER_ITEMS_STATUS_TYPES,
  ROLE_TYPES,
  STATEMENT_TYPES,
  TRANSACTION_TYPES,
} from '../../../models/shared/constants';
import { Statement } from '../../../models/Statement';
import { errorToErrorMessage, errorToHttpStatus } from '../../../services/database';
import { UTILS } from '../../../utils';
import { createStatement } from '../Statement/statement.controller';

const { PAGE_LIMIT } = constants.system;
const SET_OFF_MARGIN = 101101;

const getOrders = async (req, res) => {
  try {
    const { page = 1, status, orderNumber, reference, descending, customerRef, email } = req.query;

    if (!page) {
      return res.status(400).json({
        success: false,
        error: constants.messages.INVALID_REQUEST_ARGUMENTS,
      });
    }

    const query = {};
    if (req.user.role !== ROLE_TYPES.adminRole) {
      query.user = { $eq: req.user.id };
    }

    query.isArchived = { $ne: true };

    if (status) {
      query.status = { $eq: status };
    }

    if (reference) {
      query.reference = { $eq: reference };
    }

    if (orderNumber) {
      query.orderNumber = { $eq: orderNumber };
    }

    let orderFactor = -1;

    if (descending === 'false') {
      orderFactor = 1;
    }

    if (customerRef || email) {
      const userDoc = await User.findOne({ $or: [{ customerRef }, { email }] });

      if (!userDoc) {
        return res.status(400).json({
          success: false,
          error: constants.messages.INVALID_REQUEST_ARGUMENTS,
        });
      }

      const { _id: userId } = userDoc;

      query.user = userId.toString();
    }

    const result = await Order.find(query, {
      projection: { isArchived: 0 },
    })
      .populate('user')
      .sort({ dateCreated: orderFactor })
      .limit(PAGE_LIMIT * 1)
      .skip((page - 1) * PAGE_LIMIT)
      .exec();

    const count = await Order.countDocuments(query);
    const totalPages = Math.ceil(count / PAGE_LIMIT);

    return res.status(200).json({
      success: true,
      data: result,
      totalPages,
      currentPage: page <= totalPages ? page : totalPages,
    });
  } catch (error) {
    res.status(errorToHttpStatus(error)).send(errorToErrorMessage(error));
  }
};

const getOrder = async (req, res) => {
  const orderId = req.params.id;

  if (!orderId) {
    return res.status(400).json({
      success: false,
      error: constants.messages.INVALID_REQUEST_ARGUMENTS,
    });
  }

  try {
    const orderDoc = await Order.findOne({ _id: orderId })
      .populate([
        'user',
        {
          path: 'items.assetId',
          populate: {
            path: 'farmId',
          },
        },
      ])
      .lean();

    if (!orderDoc) {
      return res.status(400).json({
        success: false,
        error: constants.messages.COULD_NOT_FIND_ITEM_WITH_ID,
      });
    }
    const enrichedItems = orderDoc.items.map((item) => {
      const newItem = { ...item };
      if (item.assetId) {
        newItem.assetId = item.assetId?._id;
        newItem.asset = item.assetId;
        newItem.asset.farm = item.assetId?.farmId;
        newItem.asset.farmId = newItem.asset.farm?._id;
      }

      return newItem;
    });

    const cleanedUser = {
      ...orderDoc.user,
      phoneNumber: UTILS.phoneSafetyPassThrough(orderDoc.user.phoneNumber),
    };

    const paymentDocs = await Statement.find({
      reference: orderDoc.reference,
      label: STATEMENT_TYPES.credit,
    });

    const enrichedDoc = {
      ...orderDoc,
      user: cleanedUser,
      items: enrichedItems,
      payments: paymentDocs,
    };

    return res.status(200).json({
      success: true,
      data: enrichedDoc,
    });
  } catch (error) {
    console.log('Error', error);

    return res.status(errorToHttpStatus(error)).json({
      success: false,
      error: errorToErrorMessage(error),
    });
  }
};

const getMyOrders = async (req, res) => {
  try {
    const user = req.user.id;

    const orderDocs = await Order.find(
      { user, isArchived: { $ne: true } },
      {
        projection: { isArchived: 0 },
      }
    ).sort({ _id: -1 });

    return res.status(200).json({
      success: true,
      data: orderDocs,
    });
  } catch (error) {
    console.log('Error', error);

    return res.status(errorToHttpStatus(error)).json({
      success: false,
      error: errorToErrorMessage(error),
    });
  }
};

const createOrder = async (req, res) => {
  const { amount, items } = req.body;

  const { id: user } = req.user;

  // Validate type
  if (!amount || !Array.isArray(items) || !items.length) {
    return res.status(400).json({
      success: false,
      error: constants.messages.INVALID_REQUEST_ARGUMENTS,
    });
  }

  let verifiedAmount = 0;

  const products = await Product.find({}).exec();

  const itemsRaw = items.map((el) => {
    let arr = [];

    for (let i = 0; i < el.quantity; i++) {
      const product = products.find((product) => product.productType === el.productType);
      if (!product) {
        return res.status(422).send({
          success: false,
          message: 'Requested product type could not be matched',
        });
      }
      verifiedAmount += product.price || 0;
      const element = {
        productType: el.productType,
        dateOfAllocation: null,
        assetId: null,
        priceOfAsset: product.price,
      };
      arr = [...arr, element];
    }

    return arr;
  });

  if (amount != verifiedAmount) {
    return res.status(422).send({
      success: false,
      message:
        'Total amount mismatch. Please refresh page to ensure you have the latest product prices',
      errorDetails: config.IS_PRODUCTION_MODE
        ? undefined
        : {
            received: amount,
            computed: verifiedAmount,
          },
    });
  }

  const merged = itemsRaw.reduce(function (prev, curr) {
    return prev.concat(curr);
  });

  try {
    // TODO: revisit countDocuments. what happens when some documents get deleted??
    const count = await Order.countDocuments();
    const orderNumber = count + SET_OFF_MARGIN;
    const orderDoc = await Order.create({
      user,
      items: merged,
      amount: verifiedAmount,
      orderNumber: orderNumber,
      reference: `${TRANSACTION_TYPES.orderPayment}-${orderNumber}`,
    });
    req.logger.log(`Created order ${orderNumber}`);

    return res.status(201).json({
      success: true,
      data: orderDoc,
    });
  } catch (error) {
    console.log('Error', error);
    return res.status(errorToHttpStatus(error)).json({
      success: false,
      error: errorToErrorMessage(error),
    });
  }
};

const updateOrderStatus = async (req, res) => {
  const { id, paymentMethod, note, paymentRef } = req.body;

  if (!id || !paymentMethod) {
    return res.status(400).json({
      success: false,
      message: constants.messages.INVALID_REQUEST_ARGUMENTS,
    });
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const orderDoc = await Order.findOne({ _id: id }).session(session);

    if (!orderDoc) {
      return res.status(400).json({
        success: false,
        message: constants.messages.COULD_NOT_FIND_ITEM_WITH_ID,
      });
    }

    orderDoc.status = 'paid';

    await orderDoc.save();

    const paidAmount = orderDoc.amount; // @todo should also accept an user input amount here,
    // for scenarios where customers pay more than the order amount.
    // Validation: if the input amount is less than orderDoc.amount REJECT the transacation

    const statementResult = await createStatement(req, session, {
      reference: `${TRANSACTION_TYPES.orderPayment}-${orderDoc.orderNumber}`,
      user: orderDoc.user,
      transactionType: TRANSACTION_TYPES.orderPayment,
      label: STATEMENT_TYPES.credit,
      dateOfTransaction: new Date(),
      amount: paidAmount * -1,
      paymentMethod,
      paymentRef,
      note,
    });

    if (!statementResult.success) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        errorMessage: statementResult.errorMessage,
      });
    }

    await session.commitTransaction();

    req.logger.log(
      `Confirmed order ${orderDoc.orderNumber || orderDoc._id} payment amount ${paidAmount}`
    );

    req.logger.log(`Action:Confirmed an order:Admin- ${req.user.id} OrderId:${id}}`);

    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    await session.abortTransaction();
    console.log('Error', error);
    return res.status(errorToHttpStatus(error)).json({
      success: false,
      error: errorToErrorMessage(error),
    });
  } finally {
    session.endSession();
  }
};

const updatePaymentMethod = async (req, res) => {
  const { paymentMethod } = req.body;
  const { id } = req.params;

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const orderDoc = await Order.findOne({ _id: id }).session(session);

    if (!orderDoc) {
      return res.status(400).json({
        success: false,
        message: constants.messages.COULD_NOT_FIND_ITEM_WITH_ID,
      });
    }

    orderDoc.selectedPaymentMethod = paymentMethod;

    await orderDoc.save();

    await session.commitTransaction();

    req.logger.log(
      `Action:Updated payment method to ${paymentMethod} Admin- ${req.user.id} OrderId:${id}}`
    );

    return res.status(200).json({
      data: orderDoc,
    });
  } catch (error) {
    await session.abortTransaction();
    console.log('Error', error);
    return res.status(errorToHttpStatus(error)).json({
      success: false,
      error: errorToErrorMessage(error),
    });
  } finally {
    session.endSession();
  }
};

const cancelOrderItem = async (req, res) => {
  try {
    const { orderItemId } = req.body;

    const user = req.user.id;

    const docDetails = await Order.findOne({
      user,
      status: 'paid',
      items: { $elemMatch: { _id: orderItemId, assetId: null } },
    });

    if (docDetails === null) {
      return res.status(400).json({
        success: false,
        errorMessage: 'Cannot perform operation, please contact customer support',
      });
    }

    await Order.update(
      {},
      {
        $set: {
          'items.$[elem].status': ORDER_ITEMS_STATUS_TYPES.cancelled,
          'items.$[elem].updatedAt': new Date(),
        },
      },
      {
        arrayFilters: [{ 'elem._id': { $eq: orderItemId } }],
      }
    );

    req.logger.log(`Action:Cancel an order:Admin- ${req.user.id} OrderId:${id}}`);

    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    console.log('Error', error);

    return res.status(errorToHttpStatus(error)).json({
      success: false,
      error: errorToErrorMessage(error),
      errorMessage: constants.messages.AN_ERROR_OCCURRED,
    });
  }
};

export default {
  getOrders,
  getMyOrders,
  getOrder,
  createOrder,
  updateOrderStatus,
  cancelOrderItem,
  updatePaymentMethod,
};
